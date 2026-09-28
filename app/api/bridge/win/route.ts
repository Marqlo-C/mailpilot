import { NextResponse } from "next/server";

import {
  buildWinBridgeScript,
  resolveBridgeApiBase,
} from "@/lib/bridge-scripts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim() ?? "";
  const secret = searchParams.get("secret")?.trim() ?? "";
  const apiBase = resolveBridgeApiBase(request);

  const script = buildWinBridgeScript({ email, secret, apiBase });

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
