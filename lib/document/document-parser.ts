import mammoth from "mammoth";
import pdfParse from "pdf-parse";

/** Maximum permitted size (5 MB) for untrusted resume documents. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Maximum execution time (5,000 ms) for document parsing operations. */
export const DOCUMENT_PARSE_TIMEOUT_MS = 5_000;

/** Maximum number of PDF pages parsed from an uploaded resume. */
export const MAX_PDF_PAGES = 50;

/**
 * Validates that a document's byte length is non-empty and within the 5 MB limit.
 */
function assertValidDocumentSize(
  byteLength: number,
  maxBytes: number = MAX_DOCUMENT_BYTES
): void {
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new Error("Document is empty (0 bytes).");
  }
  if (byteLength > maxBytes) {
    throw new Error(
      `Document size (${byteLength} bytes) exceeds the maximum allowed limit of 5 MB.`
    );
  }
}

/**
 * Bounds an asynchronous parsing operation with a hard timeout and guarantees
 * timer cleanup so no dangling handles remain.
 */
async function withParseTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Decodes standard HTML/XML character entities into plain text characters.
 */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Converts mammoth HTML output into structured plain text while preserving
 * paragraph, list, heading, and table boundaries.
 */
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(
      /<\/(p|div|tr|li|ul|ol|table|h[1-6]|blockquote|section|article|header|footer)>/gi,
      "\n"
    )
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(withBreaks)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extracts plain text from a PDF buffer using pdf-parse v1 with strict size,
 * page count, and timeout safeguards.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Invalid PDF buffer.");
  }
  assertValidDocumentSize(buffer.byteLength);

  const data = await withParseTimeout(
    pdfParse(buffer, { max: MAX_PDF_PAGES }),
    DOCUMENT_PARSE_TIMEOUT_MS,
    `PDF document parsing timed out after ${DOCUMENT_PARSE_TIMEOUT_MS} ms.`
  );
  return (data?.text ?? "").trim();
}

/**
 * Extracts plain text from an uploaded resume file (PDF, DOCX, or TXT)
 * enforcing size limits before reading into memory, `externalFileAccess: false`
 * on DOCX, and execution timeouts.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  assertValidDocumentSize(file.size);

  const name = (file.name ?? "").toLowerCase();
  const type = (file.type ?? "").toLowerCase();

  const isPdf = type === "application/pdf" || name.endsWith(".pdf");
  const isDocx =
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx");
  const isTxt = type.startsWith("text/") || name.endsWith(".txt");

  if (!isPdf && !isDocx && !isTxt) {
    throw new Error(
      "Unsupported file type. Please upload a PDF, DOCX, or TXT resume."
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  assertValidDocumentSize(buffer.byteLength);

  if (isPdf) {
    return parsePdfBuffer(buffer);
  }

  if (isDocx) {
    const noopImageConverter =
      typeof mammoth.images?.imgElement === "function"
        ? mammoth.images.imgElement(async () => ({ src: "" }))
        : undefined;

    const result = await withParseTimeout(
      mammoth.convertToHtml(
        { buffer },
        {
          externalFileAccess: false,
          ...(noopImageConverter ? { convertImage: noopImageConverter } : {}),
        }
      ),
      DOCUMENT_PARSE_TIMEOUT_MS,
      `DOCX document parsing timed out after ${DOCUMENT_PARSE_TIMEOUT_MS} ms.`
    );
    return htmlToPlainText(result?.value ?? "");
  }

  return buffer.toString("utf8").trim();
}
