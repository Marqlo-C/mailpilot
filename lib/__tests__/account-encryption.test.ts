import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import {
  decryptPhoneAtRest,
  decryptToken,
  encryptPhoneAtRest,
  encryptToken,
  isEncryptedToken,
} from "../crypto";

describe("Account & Profile Data Encryption at Rest", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  describe("Bridge CLI Secret Vaulting", () => {
    it("encrypts secret and verifies with constant-time buffer comparison", () => {
      const rawSecret = "513d34aa664e4d19";
      const encrypted = encryptToken(rawSecret);

      expect(encrypted).not.toBe(rawSecret);
      expect(encrypted.split(":")).toHaveLength(3);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(rawSecret);

      const expectedBuf = Buffer.from(decrypted);
      const incomingBuf = Buffer.from("513d34aa664e4d19");
      const badBuf = Buffer.from("invalidsecret123");

      expect(
        expectedBuf.length === incomingBuf.length &&
          crypto.timingSafeEqual(expectedBuf, incomingBuf)
      ).toBe(true);

      expect(
        expectedBuf.length === badBuf.length &&
          crypto.timingSafeEqual(expectedBuf, badBuf)
      ).toBe(false);
    });
  });

  describe("Profile Phone Number Encryption & Legacy Compatibility", () => {
    it("encrypts phone number and cleanly restores plaintext", () => {
      const rawPhone = "+1 (555) 019-2834";
      const encrypted = encryptToken(rawPhone);

      expect(encrypted).not.toBe(rawPhone);
      expect(decryptToken(encrypted)).toBe(rawPhone);
    });

    it("encryptPhoneAtRest converts plaintext to 3-part ciphertext and is idempotent", () => {
      const rawPhone = "+1 (555) 019-2834";
      const encrypted = encryptPhoneAtRest(rawPhone);

      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(rawPhone);
      expect(encrypted?.split(":")).toHaveLength(3);
      expect(isEncryptedToken(encrypted)).toBe(true);

      // Idempotency: calling encrypt on already encrypted ciphertext does not re-encrypt
      const reEncrypted = encryptPhoneAtRest(encrypted);
      expect(reEncrypted).toBe(encrypted);
    });

    it("decryptPhoneAtRest restores original plaintext from encrypted ciphertext", () => {
      const rawPhone = "+1 (555) 019-2834";
      const encrypted = encryptPhoneAtRest(rawPhone);

      expect(decryptPhoneAtRest(encrypted)).toBe(rawPhone);
    });

    it("passes through legacy plaintext phone strings without throwing errors", () => {
      const legacyPhone = "+1-800-555-0199";
      expect(isEncryptedToken(legacyPhone)).toBe(false);
      expect(decryptPhoneAtRest(legacyPhone)).toBe(legacyPhone);
    });

    it("handles null or empty phone gracefully", () => {
      expect(encryptPhoneAtRest(null)).toBeNull();
      expect(encryptPhoneAtRest("   ")).toBeNull();
      expect(decryptPhoneAtRest(null)).toBeNull();
      expect(decryptPhoneAtRest("")).toBeNull();
    });

    it("gracefully falls back to raw string if decrypting corrupted token", () => {
      const corrupted = "abcdef0123456789abcdef01:abcdef0123456789abcdef0123456789:invalidtag";
      expect(decryptPhoneAtRest(corrupted)).toBe(corrupted);
    });
  });
});
