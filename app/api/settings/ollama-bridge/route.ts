import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

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
});

export const dynamic = "force-dynamic";

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

    const { email, ollamaUrl, action, bridgeSecret } = parsed.data;

    // Case-insensitive lookup — terminal email casing must match the same Account
    // the Settings UI session uses via accountId.
    const account = await prisma.account.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { settings: true },
    });

    // #region agent log
    fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "3c315a",
      },
      body: JSON.stringify({
        sessionId: "3c315a",
        runId: "post-fix",
        hypothesisId: "F",
        location: "api/settings/ollama-bridge:POST",
        message: "bridge registration lookup",
        data: {
          found: Boolean(account),
          accountIdLen: account?.id.length ?? 0,
          hasSettings: Boolean(account?.settings),
          action: action ?? "register",
          hasUrl: Boolean(ollamaUrl),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!account) {
      return NextResponse.json(
        {
          success: false,
          error: `No account found for ${email}`,
          _debug: { hypothesisId: "F", reason: "account_not_found" },
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
          _debug: { hypothesisId: "F", reason: "secret_mismatch" },
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

    // Keep bridgeConnected false until /api/ollama/verify pings the tunnel.
    const nextRules = accountRulesSchema.parse({
      ...rules,
      availableModels: [],
      bridgeConnected: false,
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

    return NextResponse.json({
      success: true,
      activeUrl: normalizedUrl,
      url: normalizedUrl,
      accountId: account.id,
      _debug: {
        hypothesisId: "F",
        reason: "registered",
        accountIdLen: account.id.length,
      },
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
