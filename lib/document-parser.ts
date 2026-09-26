import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/**
 * Extracts plain text from an uploaded resume file (PDF, DOCX, or TXT).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (
    type === "application/pdf" ||
    name.endsWith(".pdf")
  ) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text?.trim() ?? "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }
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
