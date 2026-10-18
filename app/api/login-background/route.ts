import { get } from "@vercel/blob";
import { existsSync, createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

export const runtime = "nodejs";

const LOGIN_BG_BLOBS = [
  process.env.LOGIN_BG_BLOB_PATH,
  "color-spin-fast.mp4",
  "color-spin-trimmed-comp.mp4",
].filter((b): b is string => Boolean(b));

const LOGIN_POSTER_BLOBS = [
  process.env.LOGIN_POSTER_BLOB_PATH,
  "color-spin-poster.webp",
  "login-bg-poster.webp",
].filter((b): b is string => Boolean(b));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get("asset");
  const isPoster = asset === "poster";

  const targetBlobs = isPoster ? LOGIN_POSTER_BLOBS : LOGIN_BG_BLOBS;
  const range = request.headers.get("range");
  const ifNoneMatch = request.headers.get("if-none-match");

  const forwardHeaders: Record<string, string> = {};
  if (range) forwardHeaders.range = range;
  if (ifNoneMatch) forwardHeaders["if-none-match"] = ifNoneMatch;

  // 1. Attempt retrieval from Vercel Blob
  for (const blobPath of targetBlobs) {
    try {
      const result = await get(blobPath, {
        access: "private",
        ...(Object.keys(forwardHeaders).length > 0
          ? { headers: forwardHeaders }
          : {}),
      });

      if (!result) continue;

      if (result.statusCode === 304) {
        return new Response(null, {
          status: 304,
          headers: {
            etag: result.headers.get("etag") ?? "",
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      }

      if (result.stream) {
        const headers = new Headers();
        headers.set(
          "Content-Type",
          result.blob.contentType ?? (isPoster ? "image/webp" : "video/mp4")
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
    } catch {
      // Gracefully continue to next blob or local fallback (e.g. if offline or missing credentials)
      break;
    }
  }

  // 2. Local fallback for development / offline environments
  const localCandidates = isPoster
    ? ["login-bg-poster.webp", "color-spin-poster.webp"]
    : ["login-bg-fast.mp4", "color-spin-trimmed-comp.mp4"];

  for (const candidate of localCandidates) {
    const localFilePath = path.join(process.cwd(), "public", "videos", candidate);
    if (!existsSync(localFilePath)) continue;

    const stat = statSync(localFilePath);
    const contentType = isPoster ? "image/webp" : "video/mp4";

    if (range && !isPoster) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const nodeStream = createReadStream(localFilePath, { start, end });
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunksize),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    const nodeStream = createReadStream(localFilePath);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  return new Response("Login background asset not found", { status: 404 });
}
