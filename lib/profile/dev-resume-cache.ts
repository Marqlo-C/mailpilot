import fs from "fs";
import path from "path";

export interface DevCachedResumeMetadata {
  hasCache: boolean;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  charCount?: number;
  githubHandle?: string;
}

export interface DevCachedResumeData extends DevCachedResumeMetadata {
  bufferBase64: string;
  sourceText?: string;
}

const DEV_CACHE_DIR = path.join(process.cwd(), ".dev-cache", "resumes");

function ensureCacheDir(): void {
  if (!fs.existsSync(DEV_CACHE_DIR)) {
    fs.mkdirSync(DEV_CACHE_DIR, { recursive: true });
  }
}

function getCacheFilePath(accountId: string): string {
  const safeId = accountId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(DEV_CACHE_DIR, `${safeId}.json`);
}

/**
 * Persists the uploaded resume file buffer and extracted source text
 * for local development re-runs and benchmark evaluations.
 */
export async function saveDevCachedResume(
  accountId: string,
  data: {
    fileName: string;
    fileType: string;
    buffer: Buffer;
    sourceText?: string;
    githubHandle?: string;
  }
): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  try {
    ensureCacheDir();
    const filePath = getCacheFilePath(accountId);
    const payload: DevCachedResumeData = {
      hasCache: true,
      fileName: data.fileName,
      fileType: data.fileType || "application/pdf",
      fileSize: data.buffer.length,
      uploadedAt: new Date().toISOString(),
      charCount: data.sourceText?.length ?? 0,
      githubHandle: data.githubHandle,
      sourceText: data.sourceText,
      bufferBase64: data.buffer.toString("base64"),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.warn("[dev-resume-cache] Failed to persist dev cache:", err);
  }
}

/**
 * Retrieves metadata about the cached resume for an account.
 */
export async function getDevCachedResumeMetadata(
  accountId: string
): Promise<DevCachedResumeMetadata | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const filePath = getCacheFilePath(accountId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as DevCachedResumeData;
    return {
      hasCache: true,
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      fileSize: parsed.fileSize,
      uploadedAt: parsed.uploadedAt,
      charCount: parsed.charCount,
      githubHandle: parsed.githubHandle,
    };
  } catch {
    return null;
  }
}

/**
 * Loads the full cached resume buffer and text for execution.
 */
export async function getDevCachedResume(
  accountId: string
): Promise<{
  fileName: string;
  fileType: string;
  buffer: Buffer;
  sourceText?: string;
  githubHandle?: string;
} | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const filePath = getCacheFilePath(accountId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as DevCachedResumeData;
    return {
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      buffer: Buffer.from(parsed.bufferBase64, "base64"),
      sourceText: parsed.sourceText,
      githubHandle: parsed.githubHandle,
    };
  } catch {
    return null;
  }
}
