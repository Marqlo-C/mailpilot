import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";

import { getAuthenticatedAccountId } from "@/lib/core/auth";
import { decryptToken } from "@/lib/core/crypto";
import { prisma } from "@/lib/core/prisma";
import { isSameRegisteredOllamaUrl } from "@/lib/ai";
import { accountRulesSchema, parseAccountRules } from "@/lib/validations/rules.schema";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const accountId = await getAuthenticatedAccountId();
    if (!accountId) {
      return NextResponse.json(
        { connected: false, error: "Unauthorized session" },
        { status: 401 }
      );
    }

    const body: unknown = await request.json().catch(() => ({}));
    const clientSuppliedUrl =
      typeof (body as { url?: unknown })?.url === "string"
        ? (body as { url: string }).url.trim()
        : undefined;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { settings: true },
    });

    if (!account) {
      return NextResponse.json(
        { connected: false, error: "Account not found" },
        { status: 404 }
      );
    }

    // Prioritize the active registered tunnel URL from database over stale browser state
    let targetUrl = account.settings?.localOllamaUrl?.trim();

    // If client explicitly sent a non-empty URL that differs from localhost, use it (manual mode)
    if (
      clientSuppliedUrl &&
      !clientSuppliedUrl.includes("localhost") &&
      !clientSuppliedUrl.includes("127.0.0.1")
    ) {
      targetUrl = clientSuppliedUrl;
    }

    // In local dev, allow localhost fallback if no tunnel is registered
    const isDev = process.env.NODE_ENV === "development";
    if (!targetUrl && isDev) {
      const devUrl =
        (clientSuppliedUrl &&
        (clientSuppliedUrl.includes("localhost") ||
          clientSuppliedUrl.includes("127.0.0.1"))
          ? clientSuppliedUrl
          : null) ||
        (account.settings?.localOllamaUrl?.trim() &&
        (account.settings.localOllamaUrl.includes("localhost") ||
          account.settings.localOllamaUrl.includes("127.0.0.1"))
          ? account.settings.localOllamaUrl.trim()
          : null) ||
        "http://127.0.0.1:11434";
      targetUrl = devUrl;
    }

    if (!targetUrl) {
      return NextResponse.json(
        {
          connected: false,
          status: "waiting",
          models: [],
          error:
            "No active bridge tunnel found. Run the terminal command on your Ollama host first.",
        },
        { status: 200 }
      );
    }

    // Ping Ollama tags with snappy 2.5s timeout for fast UI feedback
    const currentRules = parseAccountRules(account.settings?.rules);
    const registeredUrl = account.settings?.localOllamaUrl?.trim() ?? null;
    let tunnelToken: string | null = null;

    if (
      currentRules.encryptedTunnelToken &&
      registeredUrl &&
      isSameRegisteredOllamaUrl(targetUrl, registeredUrl)
    ) {
      try {
        tunnelToken = decryptToken(currentRules.encryptedTunnelToken).trim();
      } catch {
        tunnelToken = null;
      }
    }

    const endpoint = `${targetUrl.replace(/\/+$/, "")}/api/tags`;
    const fetchHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      ...(tunnelToken ? { Authorization: `Bearer ${tunnelToken}` } : {}),
    };

    let res: Response | null = null;
    let lastError: unknown = null;

    try {
      res = await fetch(endpoint, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(2500),
      });
    } catch (err) {
      lastError = err;
    }

    if (!res) {
      throw lastError ?? new Error("Could not reach Ollama.");
    }

    if (!res.ok) {
      // Mark bridge as disconnected in DB when remote Ollama returns an error
      const currentRules = parseAccountRules(account.settings?.rules);
      if (currentRules.bridgeConnected) {
        const updatedRules = accountRulesSchema.parse({
          ...currentRules,
          bridgeConnected: false,
        });
        await prisma.accountSettings.update({
          where: { accountId },
          data: { rules: updatedRules as Prisma.InputJsonValue },
        });
      }

      return NextResponse.json(
        {
          connected: false,
          status: "error",
          models: [],
          error: `Tunnel reachable but Ollama returned HTTP ${res.status}. Is the Ollama app active?`,
        },
        { status: 200 }
      );
    }

    const data: unknown = await res.json().catch(() => null);
    const modelsRaw =
      data &&
      typeof data === "object" &&
      "models" in data &&
      Array.isArray((data as { models?: unknown }).models)
        ? (data as { models: unknown[] }).models
        : [];
    const models = modelsRaw
      .map((m: unknown) => {
        if (typeof m === "string") return m;
        if (
          m &&
          typeof m === "object" &&
          "name" in m &&
          typeof (m as { name?: unknown }).name === "string"
        ) {
          return (m as { name: string }).name;
        }
        return null;
      })
      .filter((name: string | null): name is string => Boolean(name));

    const updatedRules = accountRulesSchema.parse({
      ...currentRules,
      bridgeConnected: true,
      availableModels: models.length > 0 ? models : currentRules.availableModels,
      embeddingProvider:
        currentRules.embeddingProvider === "disabled"
          ? "local_ollama"
          : currentRules.embeddingProvider,
      embeddingModel: currentRules.embeddingModel || "nomic-embed-text",
    });

    // Persist verified state and discovered models into AccountSettings
    await prisma.accountSettings.upsert({
      where: { accountId },
      update: {
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: targetUrl,
        rules: updatedRules as Prisma.InputJsonValue,
      },
      create: {
        accountId,
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: targetUrl,
        rules: updatedRules as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      {
        connected: true,
        status: "connected",
        activeUrl: targetUrl,
        models: models.length > 0 ? models : currentRules.availableModels,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.name === "TimeoutError" ||
        /timeout|aborted/i.test(err.message));

    // Live probe failed -> truthfully mark bridge as disconnected in DB
    try {
      const accountId = await getAuthenticatedAccountId();
      if (accountId) {
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          include: { settings: true },
        });
        if (account?.settings) {
          const currentRules = parseAccountRules(account.settings.rules);
          if (currentRules.bridgeConnected) {
            const updatedRules = accountRulesSchema.parse({
              ...currentRules,
              bridgeConnected: false,
            });
            await prisma.accountSettings.update({
              where: { accountId },
              data: { rules: updatedRules as Prisma.InputJsonValue },
            });
          }
        }
      }
    } catch {
      // Ignore DB write error during offline handling
    }

    return NextResponse.json(
      {
        connected: false,
        status: "offline",
        models: [],
        error: isTimeout
          ? "Connection timed out. Check that the terminal bridge is still running on your host machine."
          : "Could not reach Ollama through the registered tunnel. Ensure your host machine and bridge terminal are active.",
      },
      { status: 200 }
    );
  }
}
