import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  saveDevCachedResume,
  getDevCachedResumeMetadata,
  getDevCachedResume,
} from "@/lib/profile/dev-resume-cache";

describe("Dev Resume Cache", () => {
  const testAccountId = "test_dev_acc_123";
  const testCacheDir = path.join(process.cwd(), ".dev-cache", "resumes");
  const testCacheFile = path.join(testCacheDir, `${testAccountId}.json`);

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    if (fs.existsSync(testCacheFile)) {
      fs.unlinkSync(testCacheFile);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (fs.existsSync(testCacheFile)) {
      fs.unlinkSync(testCacheFile);
    }
  });

  it("persists and retrieves cached resume data in development", async () => {
    const dummyBuffer = Buffer.from("PDF-DUMMY-CONTENT-BYTES");
    await saveDevCachedResume(testAccountId, {
      fileName: "Sample_Resume.pdf",
      fileType: "application/pdf",
      buffer: dummyBuffer,
      sourceText: "John Doe Software Engineer Systems Architect",
      githubHandle: "johndoe",
    });

    const meta = await getDevCachedResumeMetadata(testAccountId);
    expect(meta).not.toBeNull();
    expect(meta?.hasCache).toBe(true);
    expect(meta?.fileName).toBe("Sample_Resume.pdf");
    expect(meta?.fileSize).toBe(dummyBuffer.length);
    expect(meta?.githubHandle).toBe("johndoe");

    const full = await getDevCachedResume(testAccountId);
    expect(full).not.toBeNull();
    expect(full?.fileName).toBe("Sample_Resume.pdf");
    expect(full?.sourceText).toContain("Systems Architect");
    expect(full?.buffer.toString()).toBe("PDF-DUMMY-CONTENT-BYTES");
  });

  it("returns null when no cache exists for account", async () => {
    const meta = await getDevCachedResumeMetadata("nonexistent_account");
    expect(meta).toBeNull();

    const full = await getDevCachedResume("nonexistent_account");
    expect(full).toBeNull();
  });

  it("is inert and returns null in production environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const dummyBuffer = Buffer.from("TEST");
    await saveDevCachedResume("prod_acc", {
      fileName: "Prod.pdf",
      fileType: "application/pdf",
      buffer: dummyBuffer,
    });

    const meta = await getDevCachedResumeMetadata("prod_acc");
    expect(meta).toBeNull();
  });
});
