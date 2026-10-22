import { describe, expect, it } from "vitest";
import { buildWinBridgeScript, buildMacBridgeScript } from "@/lib/utils/bridge-scripts";

describe("Bridge Scripts Generator", () => {
  const opts = {
    email: "user@example.com",
    secret: "test_secret_123",
    apiBase: "https://mailpilot-prod.vercel.app",
  };

  describe("buildWinBridgeScript", () => {
    it("generates valid PowerShell script targeting Windows without exit code 2 errors", () => {
      const script = buildWinBridgeScript(opts);

      // Variables
      expect(script).toContain('$email = "user@example.com"');
      expect(script).toContain('$secret = "test_secret_123"');
      expect(script).toContain('$apiUrl = "https://mailpilot-prod.vercel.app/api/settings/ollama-bridge"');

      // Ollama check
      expect(script).toContain("http://127.0.0.1:11434/api/tags");

      // TLS 1.2 and cloudflared download
      expect(script).toContain("[Net.SecurityProtocolType]::Tls12");
      expect(script).toContain("cloudflared-windows-amd64.exe");

      // Clean execution with stderr redirection without exit code 2
      expect(script).toContain("Start-Process -FilePath $cfPath");
      expect(script).toContain("-RedirectStandardError $tempLog");
      expect(script).toContain("tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434");
      expect(script).toContain("--http-host-header localhost:11434");

      // Regex matching tunnel URL
      expect(script).toContain("trycloudflare");

      // Registration with models
      expect(script).toContain("models = $modelNames");

      // Clean disconnect in finally block
      expect(script).toContain('action = "disconnect"');
      expect(script).toContain("Disconnected cleanly. Goodbye!");
    });
  });

  describe("buildMacBridgeScript", () => {
    it("generates valid bash script targeting macOS/Linux", () => {
      const script = buildMacBridgeScript(opts);
      expect(script).toContain('EMAIL="user@example.com"');
      expect(script).toContain('SECRET="test_secret_123"');
      expect(script).toContain("cloudflared");
    });
  });
});
