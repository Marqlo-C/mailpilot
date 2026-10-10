import { describe, it, expect } from "vitest";
import { isBlockedIp } from "../ssrf";

describe("SSRF Protection Guardrails", () => {
  it("blocks private IPv4 addresses and loopback", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true); // AWS/cloud metadata
  });

  it("blocks private IPv6 addresses", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
  });

  it("allows valid public IP addresses", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
  });
});
