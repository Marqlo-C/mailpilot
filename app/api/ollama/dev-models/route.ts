import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getAuthenticatedAccountId } from "@/lib/core/auth";
import { prisma } from "@/lib/core/prisma";
import { ollamaBaseUrlFromEnv, probeOllamaTagsWithRetry } from "@/lib/ai";
import { accountRulesSchema, parseAccountRules } from "@/lib/validations/rules.schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lists models on the dev Ollama host from OLLAMA_BASE_URL.
 * Does not read or write the stored Cloudflare tunnel.
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const accountId = await getAuthenticatedAccountId();
  if (!accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = ollamaBaseUrlFromEnv();
  try {
    const probe = await probeOllamaTagsWithRetry(url, {
      timeoutMs: 2_500,
      attempts: 1,
    });

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { settings: true },
    });

    if (account) {
      const currentRules = parseAccountRules(account.settings?.rules);
      const updatedRules = accountRulesSchema.parse({
        ...currentRules,
        bridgeConnected: true,
        availableModels:
          probe.models.length > 0 ? probe.models : currentRules.availableModels,
        embeddingProvider: "local_ollama",
        embeddingModel: "nomic-embed-text",
      });

      await prisma.accountSettings.upsert({
        where: { accountId },
        update: {
          llmProvider: "LOCAL_OLLAMA",
          localOllamaUrl: url,
          rules: updatedRules as Prisma.InputJsonValue,
        },
        create: {
          accountId,
          llmProvider: "LOCAL_OLLAMA",
          localOllamaUrl: url,
          rules: updatedRules as Prisma.InputJsonValue,
        },
      });
    }

    return NextResponse.json({ models: probe.models, url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach local Ollama";
    return NextResponse.json({ models: [], url, error: message });
  }
}
