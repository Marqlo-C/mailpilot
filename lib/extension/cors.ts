import { NextResponse } from "next/server";

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin.startsWith("chrome-extension://")) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (origin === "https://mailpilot-prod.vercel.app") return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-mailpilot-session-token",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function handleOptionsCors(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export function jsonWithCors(
  data: unknown,
  init: ResponseInit & { request: Request }
): NextResponse {
  const { request, ...responseInit } = init;
  const corsHeaders = getCorsHeaders(request);
  const existingHeaders =
    responseInit.headers instanceof Headers
      ? Object.fromEntries(responseInit.headers.entries())
      : (responseInit.headers as Record<string, string> | undefined) ?? {};

  return NextResponse.json(data, {
    ...responseInit,
    headers: {
      ...existingHeaders,
      ...corsHeaders,
    },
  });
}
