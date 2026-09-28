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
  url: z.string().url().optional(),
  heartbeat: z.boolean().optional().default(false),
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
  opts: { connected: boolean; models: string[] }
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
    data: { rules: validated as Prisma.InputJsonValue },
  });
}

/** Drops tunnel URL and connection flags when the bridge is no longer reachable. */
async function clearBridgeConnection(accountId: string): Promise<void> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) return;

  const current = parseAccountRules(settings.rules);
  const validated = accountRulesSchema.parse({
    ...current,
    availableModels: [],
    bridgeConnected: false,
  });

  await prisma.accountSettings.update({
    where: { accountId },
    data: {
      localOllamaUrl: null,
      rules: validated as Prisma.InputJsonValue,
    },
  });
}

async function handleUnreachable(
  accountId: string,
  hadStoredUrl: boolean,
  error: string,
  status: OllamaConnectionStatus
): Promise<NextResponse> {
  if (hadStoredUrl) {
    await clearBridgeConnection(accountId);
  } else {
    await persistBridgeStatus(accountId, { connected: false, models: [] });
  }

  return NextResponse.json({
    connected: false,
    status,
    models: [],
    cleared: hadStoredUrl,
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
      return NextResponse.json(
        {
          connected: false,
          status: "error" satisfies OllamaConnectionStatus,
          models: [],
          error: "Invalid request body",
        },
        { status: 400 }
      );
    }

    const settings = await prisma.accountSettings.findUnique({
      where: { accountId },
      select: { localOllamaUrl: true, rules: true },
    });

    const storedUrl = settings?.localOllamaUrl?.trim() ?? "";
    let targetUrl = parsed.data.url?.trim();

    if (!targetUrl) {
      targetUrl = storedUrl || undefined;
    }

    if (!targetUrl) {
      await persistBridgeStatus(accountId, { connected: false, models: [] });
      return NextResponse.json({
        connected: false,
        status: "waiting" satisfies OllamaConnectionStatus,
        models: [],
      });
    }

    const hadStoredUrl = storedUrl.length > 0;
    const base = normalizeOllamaBaseUrl(targetUrl);

    if (!isAllowedOllamaUrl(base)) {
      return handleUnreachable(
        accountId,
        hadStoredUrl,
        "URL not allowed. Use a *.trycloudflare.com tunnel or localhost.",
        "error"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    let res: Response;
    try {
      res = await fetch(`${base}/api/tags`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      clearTimeout(timeout);
      return handleUnreachable(
        accountId,
        hadStoredUrl,
        "Could not reach Ollama at this URL.",
        hadStoredUrl ? "offline" : "waiting"
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return handleUnreachable(
        accountId,
        hadStoredUrl,
        `Ollama responded with HTTP ${res.status}`,
        hadStoredUrl ? "offline" : "error"
      );
    }

    const json: unknown = await res.json();
    const tags = ollamaTagsSchema.safeParse(json);
    const models = tags.success ? extractModelNames(tags.data.models) : [];

    await persistBridgeStatus(accountId, { connected: true, models });

    if (storedUrl !== base) {
      await prisma.accountSettings.update({
        where: { accountId },
        data: { localOllamaUrl: base },
      });
    }

    return NextResponse.json({
      connected: true,
      status: "connected" satisfies OllamaConnectionStatus,
      activeUrl: base,
      models,
    });
  } catch {
    try {
      const accountId = await getAuthenticatedAccountId();
      if (accountId) {
        const settings = await prisma.accountSettings.findUnique({
          where: { accountId },
          select: { localOllamaUrl: true },
        });
        const hadStoredUrl = Boolean(settings?.localOllamaUrl?.trim());
        if (hadStoredUrl) {
          await clearBridgeConnection(accountId);
        } else {
          await persistBridgeStatus(accountId, {
            connected: false,
            models: [],
          });
        }
      }
    } catch {
      // best-effort status clear
    }

    return NextResponse.json({
      connected: false,
      status: "offline" satisfies OllamaConnectionStatus,
      models: [],
      error: "Could not reach Ollama at this URL.",
    });
  }
}
