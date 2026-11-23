import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const FIVE_MB = 5 * 1024 * 1024;

beforeEach(() => {
  vi.resetModules();
  vi.doMock("pdf-parse", () => ({
    default: vi.fn(async () => ({ text: "" })),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("mammoth");
  vi.doUnmock("pdf-parse");
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("document-parser security & safeguard boundaries", () => {
  it("exports expected security safeguard constants", async () => {
    const parser = await import("../document-parser");
    expect(parser.MAX_DOCUMENT_BYTES).toBe(FIVE_MB);
    expect(parser.DOCUMENT_PARSE_TIMEOUT_MS).toBe(5_000);
    expect(parser.MAX_PDF_PAGES).toBe(50);
  });

  it("rejects empty and oversized PDF buffers before invoking pdf-parse", async () => {
    const pdfParseSpy = vi.fn();
    vi.doMock("pdf-parse", () => ({ default: pdfParseSpy }));

    const { parsePdfBuffer } = await import("../document-parser");
    await expect(parsePdfBuffer(Buffer.alloc(0))).rejects.toThrow(/empty/i);
    await expect(parsePdfBuffer(Buffer.alloc(FIVE_MB + 1, 0x25))).rejects.toThrow(
      /5 MB/i
    );
    expect(pdfParseSpy).not.toHaveBeenCalled();
  });

  it("passes MAX_PDF_PAGES (50) to pdf-parse and trims extracted text", async () => {
    const pdfParseSpy = vi.fn(async () => ({ text: "  Extracted Resume Text \n" }));
    vi.doMock("pdf-parse", () => ({ default: pdfParseSpy }));

    const { parsePdfBuffer, MAX_PDF_PAGES } = await import("../document-parser");
    const sample = Buffer.from("%PDF-1.4 sample");
    const text = await parsePdfBuffer(sample);

    expect(text).toBe("Extracted Resume Text");
    expect(pdfParseSpy).toHaveBeenCalledWith(sample, { max: MAX_PDF_PAGES });
  });

  it("enforces externalFileAccess: false on mammoth.convertToHtml and normalizes HTML to text", async () => {
    const convertToHtmlSpy = vi.fn(
      async (_input: unknown, _options?: Record<string, unknown>) => ({
        value: "<p>Taylor &amp; Co</p><ul><li>Lead &lt;Architect&gt;</li></ul>",
        messages: [],
      })
    );
    vi.doMock("mammoth", () => ({
      default: {
        convertToHtml: convertToHtmlSpy,
        images: { imgElement: vi.fn(() => async () => ({ src: "" })) },
      },
    }));

    const { extractTextFromFile } = await import("../document-parser");
    const docxFile = new File([Buffer.from("PK\x03\x04dummy")], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const text = await extractTextFromFile(docxFile);
    expect(convertToHtmlSpy).toHaveBeenCalledTimes(1);
    expect(convertToHtmlSpy.mock.calls[0]?.[1]).toMatchObject({
      externalFileAccess: false,
    });
    expect(text).toContain("Taylor & Co");
    expect(text).toContain("Lead <Architect>");
  });

  it("rejects oversized File before calling file.arrayBuffer()", async () => {
    const { extractTextFromFile } = await import("../document-parser");
    const bigFile = new File([Buffer.alloc(FIVE_MB + 1, 0x41)], "big.pdf", {
      type: "application/pdf",
    });
    const abSpy = vi.spyOn(bigFile, "arrayBuffer");

    await expect(extractTextFromFile(bigFile)).rejects.toThrow(/5 MB/i);
    expect(abSpy).not.toHaveBeenCalled();
  });

  it("times out hung PDF parsing after 5,000 ms and clears timer", async () => {
    vi.useFakeTimers();
    vi.doMock("pdf-parse", () => ({
      default: () => new Promise(() => {}),
    }));

    const { parsePdfBuffer } = await import("../document-parser");
    const pending = parsePdfBuffer(Buffer.from("%PDF-1.4")).then(
      () => null,
      (err: unknown) => err
    );

    await vi.advanceTimersByTimeAsync(5_001);
    const err = await pending;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/timed out/i);
    expect(vi.getTimerCount()).toBe(0);
  });
});
