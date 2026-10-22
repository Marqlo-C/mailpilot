import mammoth from "mammoth";
import pdfParse from "pdf-parse";

/**
 * Extracts plain text from a PDF buffer using pdf-parse v1.
 * Runs entirely in-process on Node — no pdfjs worker.mjs file required.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return (data.text ?? "").trim();
}

/**
 * Extracts plain text from an uploaded resume file (PDF, DOCX, or TXT).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return parsePdfBuffer(buffer);
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (type.startsWith("text/") || name.endsWith(".txt")) {
    return buffer.toString("utf8").trim();
  }

  throw new Error(
    "Unsupported file type. Please upload a PDF, DOCX, or TXT resume."
  );
}
