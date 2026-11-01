import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { handleOptionsCors } from "@/lib/extension/cors";

export async function OPTIONS(request: Request) {
  return handleOptionsCors(request);
}

export async function GET() {
  const possiblePaths = [
    path.join(process.cwd(), "public", "downloads", "mailpilot-extension.zip"),
    path.join(process.cwd(), "mailpilot-extension.zip"),
  ];

  for (const zipPath of possiblePaths) {
    if (fs.existsSync(zipPath)) {
      const fileBuffer = fs.readFileSync(zipPath);
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="mailpilot-extension.zip"',
          "Content-Length": fileBuffer.byteLength.toString(),
          "Cache-Control": "public, max-age=3600, must-revalidate",
        },
      });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Extension package not found. Run 'npm run package:extension' to generate mailpilot-extension.zip.",
    },
    { status: 404 }
  );
}
