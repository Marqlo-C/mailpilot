import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getAuthenticatedAccountId } from "@/lib/auth";
import { normalizeOllamaBaseUrl } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
} from "@/lib/validations/rules";

export const dynamic = "force-dynamic";

const verifyBodySchema = z.object({
  // Empty string from clients must not hard-fail as 400
  url: z.preprocess((val) => {
    if (typeof val !== "string") return undefined;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().url().optional()),
});

const ollamaTagsSchema = z.object({
  models: z
    .array(
      z.union([
        z.string(),
        z.object({
          name: z.string().optional(),
          model: z.string().optional(),
        }),
      ])
    )
    .optional()
    .default([]),
});

export type OllamaConnectionStatus =
  | "connected"
  | "waiting"
  | "offline"
  | "error";

/**
 * Allow Cloudflare Quick Tunnels and local Ollama during development.
 * Blocks other hosts to reduce SSRF risk from the verify proxy.
 */
function isAllowedOllamaUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    if (host.endsWith(".trycloudflare.com") && parsed.protocol === "https:") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True only for a registered Cloudflare Quick Tunnel (not the schema default localhost). */
function isRegisteredTunnelUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase().endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}

function extractModelNames(
  models: z.infer<typeof ollamaTagsSchema>["models"]
): string[] {
  return models
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      return (entry.name ?? entry.model ?? "").trim();
    })
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

async function persistBridgeStatus(
  accountId: string,
  opts: {
    connected: boolean;
    models: string[];
    localOllamaUrl?: string | null;
    setLocalProvider?: boolean;
  }
): Promise<void> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) return;

  const current = parseAccountRules(settings.rules);
  const validated = accountRulesSchema.parse({
    ...current,
    availableModels: opts.models,
    bridgeConnected: opts.connected,
  });

  await prisma.accountSettings.update({
    where: { accountId },
    data: {
      rules: validated as Prisma.InputJsonValue,
      ...(opts.localOllamaUrl !== undefined
        ? { localOllamaUrl: opts.localOllamaUrl }
        : {}),
      ...(opts.setLocalProvider && opts.connected
        ? { llmProvider: "LOCAL_OLLAMA" as const }
        : {}),
    },
  });
}

/** Marks bridge offline without wiping the registered tunnel URL. */
async function handleUnreachable(
  accountId: string,
  error: string,
  status: OllamaConnectionStatus
): Promise<NextResponse> {
  // Never clear localOllamaUrl on a failed ping — Cloudflare/Ollama can
  // return transient 403s; wiping the URL forces the user to re-run the CLI.
  await persistBridgeStatus(accountId, { connected: false, models: [] });

  return NextResponse.json({
    connected: false,
    status,
    models: [],
    cleared: false,
    error,
  });
}

export async function POST(request: Request) {
  try {
    const accountId = await getAuthenticatedAccountId();
    if (!accountId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw: unknown = await request.json().catch(() => ({}));
    const parsed = verifyBodySchema.safeParse(raw);
    if (!parsed.success) {
      // Treat bad/empty body like missing tunnel (no 400 loop in Network tab)
      return NextResponse.json({
        connected: false,
        status: "waiting" satisfies OllamaConnectionStatus,
        models: [],
        error:
          "Bridge tunnel not found. Run the terminal command, then Check Connection.",
      });
    }

    // Same AccountSettings row the bridge registers via accountId (session cookie).
    // Also re-resolve by email so casing / multi-path writes can't diverge.
    const account = await prisma.account.findFirst({
      where: { id: accountId, isActive: true },
      select: {
        id: true,
        email: true,
        settings: { select: { localOllamaUrl: true } },
      },
    });

    const settingsByEmail =
      account?.email != null
        ? await prisma.accountSettings.findFirst({
            where: {
              account: {
                email: { equals: account.email, mode: "insensitive" },
              },
            },
            select: { localOllamaUrl: true, accountId: true },
          })
        : null;

    const rawStored =
      account?.settings?.localOllamaUrl?.trim() ||
      settingsByEmail?.localOllamaUrl?.trim() ||
      "";
    // Prefer a registered Cloudflare tunnel; also accept local Ollama hosts.
    const storedTunnel = isRegisteredTunnelUrl(rawStored) ? rawStored : "";
    const payloadUrl = parsed.data.url?.trim() || "";
    const payloadTunnel = isRegisteredTunnelUrl(payloadUrl) ? payloadUrl : "";

    const isDev = process.env.NODE_ENV === "development";
    const storedLocal =
      rawStored && isAllowedOllamaUrl(normalizeOllamaBaseUrl(rawStored))
        ? normalizeOllamaBaseUrl(rawStored)
        : "";
    const payloadLocal =
      payloadUrl &&
      !isRegisteredTunnelUrl(payloadUrl) &&
      isAllowedOllamaUrl(normalizeOllamaBaseUrl(payloadUrl))
        ? normalizeOllamaBaseUrl(payloadUrl)
        : "";

    // Tunnel first in prod; in dev fall back to direct 127.0.0.1 when no tunnel.
    const targetUrl =
      payloadTunnel ||
      storedTunnel ||
      (isDev ? payloadLocal || storedLocal || "http://127.0.0.1:11434" : undefined);

    if (!targetUrl) {
      await persistBridgeStatus(accountId, { connected: false, models: [] });
      // 200 (not 400): missing tunnel is an expected bridge state, not a client error
      return NextResponse.json({
        success: false,
        connected: false,
        status: "waiting" satisfies OllamaConnectionStatus,
        models: [],
        error:
          "Bridge tunnel not found. Make sure the terminal command registered successfully with your email.",
      });
    }

    const hadStoredUrl = storedTunnel.length > 0 || storedLocal.length > 0;
    const base = normalizeOllamaBaseUrl(targetUrl);

    if (!isAllowedOllamaUrl(base)) {
      return handleUnreachable(
        accountId,
        "URL not allowed. Use a *.trycloudflare.com tunnel or localhost.",
        "error"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let res: Response;
    try {
      res = await fetch(`${base}/api/tags`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": "MailPilot-Bridge/1.0",
          Accept: "application/json",
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError");
      return handleUnreachable(
        accountId,
        isTimeout
          ? "Connection timed out. Check that your terminal bridge is running."
          : "Failed to reach tunnel endpoint.",
        hadStoredUrl ? "offline" : "waiting"
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return handleUnreachable(
        accountId,
        `Daemon returned status ${res.status}`,
        hadStoredUrl ? "offline" : "error"
      );
    }

    const json: unknown = await res.json();
    const tags = ollamaTagsSchema.safeParse(json);
    const models = tags.success ? extractModelNames(tags.data.models) : [];

    await persistBridgeStatus(accountId, {
      connected: true,
      models,
      localOllamaUrl: base,
      setLocalProvider: true,
    });

    return NextResponse.json({
      success: true,
      connected: true,
      status: "connected" satisfies OllamaConnectionStatus,
      activeUrl: base,
      models,
    });
  } catch (err) {
    try {
      const accountId = await getAuthenticatedAccountId();
      if (accountId) {
        await persistBridgeStatus(accountId, {
          connected: false,
          models: [],
        });
      }
    } catch {
      // best-effort status clear
    }

    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");

    return NextResponse.json({
      connected: false,
      status: "offline" satisfies OllamaConnectionStatus,
      models: [],
      cleared: false,
      error: isTimeout
        ? "Connection timed out. Check that your terminal bridge is running."
        : "Failed to reach tunnel endpoint.",
    });
  }
}
