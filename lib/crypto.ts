import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("TOKEN_ENCRYPTION_KEY environment variable is not set");
  }

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }

  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a single string: `iv:authTag:encryptedData` (all hex-encoded).
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a string produced by `encryptToken`.
 * Expects format: `iv:authTag:encryptedData` (all hex-encoded).
 */
export function decryptToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted token format; expected iv:authTag:encryptedData"
    );
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Checks if a string is formatted as an AES-256-GCM token (iv:authTag:encryptedData).
 */
export function isEncryptedToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.trim().split(":");
  return (
    parts.length === 3 &&
    parts.every((p) => p.length > 0 && /^[0-9a-fA-F]+$/.test(p))
  );
}

/**
 * Encrypts a phone number if non-empty and not already in encrypted format.
 */
export function encryptPhoneAtRest(
  phone: string | null | undefined
): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  if (isEncryptedToken(trimmed)) {
    return trimmed;
  }
  return encryptToken(trimmed);
}

/**
 * Decrypts a phone number at rest, falling back gracefully to raw plaintext
 * if decryption fails or if it's in legacy plaintext format.
 */
export function decryptPhoneAtRest(
  phone: string | null | undefined
): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  if (isEncryptedToken(trimmed)) {
    try {
      return decryptToken(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
