import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/blob
vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
}));

// Mock node:fs
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
  };
});

import { get } from "@vercel/blob";
import { existsSync, statSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { GET } from "../route";

describe("Login Background Route Handler (/api/login-background)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves video with range support when queried without params", async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0, 1, 2, 3]));
        controller.close();
      },
    });

    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers({
        "content-length": "4",
        "etag": '"video-etag"',
      }),
      blob: {
        contentType: "video/mp4",
        size: 4,
        pathname: "color-spin-fast.mp4",
        url: "https://blob.vercel-storage.com/color-spin-fast.mp4",
        uploadedAt: new Date(),
        downloadUrl: "https://blob.vercel-storage.com/color-spin-fast.mp4",
      },
      stream: mockStream,
    } as any);

    const req = new Request("http://localhost:3000/api/login-background");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Cache-Control")).toContain("public, max-age=86400");
  });

  it("serves poster when asset=poster is specified", async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xd8]));
        controller.close();
      },
    });

    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers({
        "content-length": "2",
        "etag": '"poster-etag"',
      }),
      blob: {
        contentType: "image/webp",
        size: 2,
        pathname: "color-spin-poster.webp",
        url: "https://blob.vercel-storage.com/color-spin-poster.webp",
        uploadedAt: new Date(),
        downloadUrl: "https://blob.vercel-storage.com/color-spin-poster.webp",
      },
      stream: mockStream,
    } as any);

    const req = new Request("http://localhost:3000/api/login-background?asset=poster");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("handles 304 Not Modified from Blob", async () => {
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 304,
      headers: new Headers({
        etag: '"cached-etag"',
      }),
      blob: {} as any,
    } as any);

    const req = new Request("http://localhost:3000/api/login-background", {
      headers: { "if-none-match": '"cached-etag"' },
    });
    const res = await GET(req);

    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"cached-etag"');
  });

  it("falls back to local public file when Blob throws and local file exists", async () => {
    vi.mocked(get).mockRejectedValueOnce(new Error("Access denied / unauthenticated local dev"));
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(statSync).mockReturnValueOnce({ size: 1234 } as any);
    vi.mocked(createReadStream).mockReturnValueOnce(
      new Readable({
        read() {
          this.push(Buffer.from([1, 2, 3]));
          this.push(null);
        },
      }) as any
    );

    const req = new Request("http://localhost:3000/api/login-background?asset=poster");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("returns 404 when Blob throws and no local file exists", async () => {
    vi.mocked(get).mockRejectedValueOnce(new Error("Access denied"));
    vi.mocked(existsSync).mockReturnValue(false);

    const req = new Request("http://localhost:3000/api/login-background?asset=poster");
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Login background asset not found");
  });

  it("returns 429 Too Many Requests when rate limit is exceeded", async () => {
    const ratelimitModule = await import("@/lib/ratelimit");
    vi.spyOn(ratelimitModule, "checkRateLimit").mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 5000,
    });

    const req = new Request("http://localhost:3000/api/login-background", {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(await res.text()).toBe("Too Many Requests");
  });
});
