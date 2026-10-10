import { NextResponse } from "next/server";

import { getAuthenticatedAccountId } from "@/lib/auth";
import { ollamaBaseUrlFromEnv, probeOllamaTagsWithRetry } from "@/lib/llm";

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
      timeoutMs: 6_000,
      attempts: 2,
    });
    return NextResponse.json({ models: probe.models, url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach local Ollama";
    return NextResponse.json({ models: [], url, error: message });
  }
}
