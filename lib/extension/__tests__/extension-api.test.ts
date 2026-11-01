import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "" }),
}));

import { getCorsHeaders, isAllowedOrigin, handleOptionsCors, jsonWithCors } from "@/lib/extension/cors";
import { getExtensionAccountId } from "@/lib/extension/auth";
import { OPTIONS as sessionOptions, GET as sessionGet } from "@/app/api/extension/session/route";
import { OPTIONS as tailorOptions, POST as tailorPost } from "@/app/api/extension/tailor/route";
import { OPTIONS as exportOptions, POST as exportPost } from "@/app/api/extension/export/route";

describe("Extension CORS & Preflight SSOT", () => {
  it("authorizes chrome-extension origins", () => {
    expect(isAllowedOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop")).toBe(true);
  });

  it("authorizes local dev origins", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("authorizes production and vercel preview domains", () => {
    expect(isAllowedOrigin("https://mailpilot-prod.vercel.app")).toBe(true);
    expect(isAllowedOrigin("https://mailpilot-preview-branch.vercel.app")).toBe(true);
  });

  it("rejects untrusted third-party origins", () => {
    expect(isAllowedOrigin("https://malicious-site.com")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it("returns credentials and matching origin header for allowed origins", () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/session", {
      headers: { origin: "chrome-extension://testextensionid" },
    });
    const headers = getCorsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe("chrome-extension://testextensionid");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });

  it("handles OPTIONS preflight cleanly", () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/session", {
      method: "OPTIONS",
      headers: { origin: "chrome-extension://testextensionid" },
    });
    const res = handleOptionsCors(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("chrome-extension://testextensionid");
  });

  it("attaches CORS headers to JSON responses", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/session", {
      headers: { origin: "http://localhost:3000" },
    });
    const res = jsonWithCors({ success: true }, { status: 200, request: req });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("Extension Authentication Resolver", () => {
  it("rejects requests without headers or cookies", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/session");
    const accountId = await getExtensionAccountId(req);
    expect(accountId).toBeNull();
  });
});

describe("Extension Route Handlers Input Validation", () => {
  it("handles OPTIONS on session route", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/session", {
      method: "OPTIONS",
      headers: { origin: "chrome-extension://testextensionid" },
    });
    const res = await sessionOptions(req);
    expect(res.status).toBe(204);
  });

  it("returns 401 on session route when unauthenticated", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/session", {
      method: "GET",
    });
    const res = await sessionGet(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("handles OPTIONS on tailor route", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/tailor", {
      method: "OPTIONS",
      headers: { origin: "chrome-extension://testextensionid" },
    });
    const res = await tailorOptions(req);
    expect(res.status).toBe(204);
  });

  it("returns 401 on tailor route when unauthenticated", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/tailor", {
      method: "POST",
      body: JSON.stringify({ company: "Acme", title: "Dev", description: "Build apps" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await tailorPost(req);
    expect(res.status).toBe(401);
  });

  it("handles OPTIONS on export route", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/export", {
      method: "OPTIONS",
      headers: { origin: "chrome-extension://testextensionid" },
    });
    const res = await exportOptions(req);
    expect(res.status).toBe(204);
  });

  it("returns 401 on export route when unauthenticated", async () => {
    const req = new Request("https://mailpilot-prod.vercel.app/api/extension/export", {
      method: "POST",
      body: JSON.stringify({ opportunityId: "opp-123", format: "pdf" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await exportPost(req);
    expect(res.status).toBe(401);
  });
});
