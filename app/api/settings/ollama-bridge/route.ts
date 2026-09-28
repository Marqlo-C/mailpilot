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
    const raw: unknown = await request.json();
    const parsed = bridgeBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Invalid or missing bridge secret",
        },
        { status: 400 }
      );
    }

    const { email, ollamaUrl, action, bridgeSecret } = parsed.data;

    const account = await prisma.account.findUnique({
      where: { email },
      include: { settings: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const rules = parseAccountRules(account.settings?.rules);
    if (!rules.bridgeSecret || rules.bridgeSecret !== bridgeSecret) {
      return NextResponse.json(
        { error: "Invalid or missing bridge secret" },
        { status: 403 }
      );
    }

    if (action === "disconnect") {
      if (account.settings) {
        const validated = accountRulesSchema.parse({
          ...rules,
          bridgeSecret: null,
          availableModels: [],
          bridgeConnected: false,
        });

        await prisma.accountSettings.update({
          where: { accountId: account.id },
          data: {
            localOllamaUrl: null,
            llmProvider: "OPENROUTER",
            rules: validated as Prisma.InputJsonValue,
          },
        });
      }
      return NextResponse.json({
        success: true,
        message: "Bridge disconnected",
      });
    }

    if (!ollamaUrl || !CLOUDFLARE_TUNNEL_REGEX.test(ollamaUrl)) {
      return NextResponse.json(
        {
          error:
            "Invalid tunnel URL. Only *.trycloudflare.com domains are allowed.",
        },
        { status: 400 }
      );
    }

    const normalizedUrl = ollamaUrl.replace(/\/+$/, "");

    await prisma.accountSettings.upsert({
      where: { accountId: account.id },
      update: {
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: normalizedUrl,
      },
      create: {
        accountId: account.id,
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: normalizedUrl,
      },
    });

    return NextResponse.json({ success: true, activeUrl: normalizedUrl });
  } catch (error) {
    console.error("Bridge update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
