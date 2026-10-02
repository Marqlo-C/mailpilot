import { get } from "@vercel/blob";

const LOGIN_BG_BLOB = "color-spin-trimmed-comp.mp4";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const range = request.headers.get("range");
  const ifNoneMatch = request.headers.get("if-none-match");

  const forwardHeaders: Record<string, string> = {};
  if (range) forwardHeaders.range = range;
  if (ifNoneMatch) forwardHeaders["if-none-match"] = ifNoneMatch;

  const result = await get(LOGIN_BG_BLOB, {
    access: "private",
    ...(Object.keys(forwardHeaders).length > 0
      ? { headers: forwardHeaders }
      : {}),
  });

  if (!result) {
    return new Response("Login background not found", { status: 404 });
  }

  if (result.statusCode === 304) {
    return new Response(null, {
      status: 304,
      headers: {
        etag: result.headers.get("etag") ?? "",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  if (!result.stream) {
    return new Response("Login background unavailable", { status: 502 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    result.blob.contentType ?? "video/mp4"
  );
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=86400, immutable");

  const contentLength = result.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  const contentRange = result.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  const etag = result.headers.get("etag");
  if (etag) headers.set("ETag", etag);

  return new Response(result.stream, {
    status: contentRange ? 206 : 200,
    headers,
  });
}
