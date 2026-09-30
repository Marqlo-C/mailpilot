import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { probeOllamaTagsWithRetry } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
} from "@/lib/validations/rules";

/** Strictly validate Cloudflare Quick Tunnel hostnames (SSRF guard). */
const CLOUDFLARE_TUNNEL_REGEX =
  /^https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com\/?$/;

const bridgeBodySchema = z.object({
  email: z.string().email(),
  ollamaUrl: z.string().url().optional(),
  action: z.enum(["disconnect"]).optional(),
  bridgeSecret: z.string().min(1, "bridgeSecret is required"),
  /**
   * Model tags from the bridge CLI probing localhost Ollama.
   * Trusted when bridgeSecret matches — avoids relying on Vercel→Cloudflare.
   */
  models: z.array(z.string().min(1)).optional(),
});

export const dynamic = "force-dynamic";

function normalizeModelList(models: string[] | undefined): string[] {
  if (!models?.length) return [];
  return [...new Set(models.map((m) => m.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = bridgeBodySchema.safeParse({
      ...raw,
      email:
        typeof (raw as { email?: unknown }).email === "string"
          ? (raw as { email: string }).email.trim().toLowerCase()
          : (raw as { email?: unknown }).email,
      bridgeSecret:
        typeof (raw as { bridgeSecret?: unknown }).bridgeSecret === "string"
          ? (raw as { bridgeSecret: string }).bridgeSecret.trim()
          : (raw as { bridgeSecret?: unknown }).bridgeSecret,
      ollamaUrl:
        typeof (raw as { ollamaUrl?: unknown }).ollamaUrl === "string"
          ? (raw as { ollamaUrl: string }).ollamaUrl.trim()
          : (raw as { ollamaUrl?: unknown }).ollamaUrl,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsed.error.issues[0]?.message ??
            "Invalid or missing bridge secret",
        },
        { status: 400 }
      );
    }

    const { email, ollamaUrl, action, bridgeSecret, models: clientModels } =
      parsed.data;

    // Case-insensitive lookup — terminal email casing must match the same Account
    // the Settings UI session uses via accountId.
    const account = await prisma.account.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { settings: true },
    });

    if (!account) {
      return NextResponse.json(
        {
          success: false,
          error: `No account found for ${email}`,
        },
        { status: 404 }
      );
    }

    const rules = parseAccountRules(account.settings?.rules);
    if (!rules.bridgeSecret || rules.bridgeSecret !== bridgeSecret) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid or missing bridge CLI secret",
        },
        { status: 403 }
      );
    }

    if (action === "disconnect") {
      if (account.settings) {
        const validated = accountRulesSchema.parse({
          ...rules,
          availableModels: [],
          bridgeConnected: false,
        });

        await prisma.accountSettings.update({
          where: { accountId: account.id },
          data: {
            localOllamaUrl: null,
            rules: validated as Prisma.InputJsonValue,
          },
        });
      }
      return NextResponse.json({
        success: true,
        message: "Bridge disconnected",
        accountId: account.id,
      });
    }

    if (!ollamaUrl || !CLOUDFLARE_TUNNEL_REGEX.test(ollamaUrl)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid tunnel URL. Only *.trycloudflare.com domains are allowed.",
        },
        { status: 400 }
      );
    }

    const normalizedUrl = ollamaUrl.replace(/\/+$/, "");
    const fromCli = normalizeModelList(clientModels);

    // Prefer CLI-local proof of Ollama (secret-authenticated). Vercel often cannot
    // reliably reach trycloudflare.com, so do not require a cloud-side tunnel probe.
    let models = fromCli;
    let connected = fromCli.length > 0;
    let connectedVia: "cli" | "tunnel" | "none" = connected ? "cli" : "none";

    if (!connected) {
      try {
        const probe = await probeOllamaTagsWithRetry(normalizedUrl, {
          timeoutMs: 12_000,
          attempts: 3,
        });
        models = probe.models;
        connected = true;
        connectedVia = "tunnel";
      } catch (probeErr) {
        console.warn("[Ollama:Bridge] Tunnel registered but probes failed", {
          url: normalizedUrl,
          error:
            probeErr instanceof Error ? probeErr.message : String(probeErr),
        });
      }
    }

    const nextRules = accountRulesSchema.parse({
      ...rules,
      availableModels: models,
      bridgeConnected: connected,
    });

    await prisma.accountSettings.upsert({
      where: { accountId: account.id },
      update: {
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: normalizedUrl,
        rules: nextRules as Prisma.InputJsonValue,
      },
      create: {
        accountId: account.id,
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: normalizedUrl,
        rules: nextRules as Prisma.InputJsonValue,
      },
    });

    if (connected) {
      console.info("[Ollama:Bridge]", {
        connected: true,
        connectedVia,
        url: normalizedUrl,
        modelsCount: models.length,
        accountId: account.id,
      });
    }

    return NextResponse.json({
      success: true,
      activeUrl: normalizedUrl,
      url: normalizedUrl,
      accountId: account.id,
      connected,
      connectedVia,
      models,
    });
  } catch (error) {
    console.error("[OLLAMA_BRIDGE_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
