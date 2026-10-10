import { describe, it, expect, beforeAll } from "vitest";
import { encryptToken, decryptToken } from "../crypto";

describe("Crypto Token Security (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("successfully encrypts and decrypts a sensitive token", () => {
    const secret = "sk-openrouter-secret-key-123456789";
    const encrypted = encryptToken(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:encrypted

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("throws an error when decrypting tampered data", () => {
    const secret = "sensitive_data";
    const encrypted = encryptToken(secret);
    const parts = encrypted.split(":");

    // Tamper with the ciphertext
    const tampered = `${parts[0]}:${parts[1]}:deadbeef`;
    expect(() => decryptToken(tampered)).toThrow();
  });
});
