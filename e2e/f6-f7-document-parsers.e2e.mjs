import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  realPdfParse,
  buildDocxFile,
  buildMinimalPdfBuffer,
  buildPdfFile,
} from "./helpers/e2e-fixtures.mjs";

const FIVE_MB = 5 * 1024 * 1024;

async function buildExactSizeDocxFile(targetBytes, filename = "exact.docx") {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const makeDocXml = (commentLen) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!--${"a".repeat(commentLen)}-->
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Exact Size Candidate</w:t></w:r></w:p></w:body>
</w:document>`;

  zip.file("word/document.xml", makeDocXml(0));
  const baseBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });

  const delta = targetBytes - baseBuf.length;
  zip.file("word/document.xml", makeDocXml(Math.max(0, delta)));
  const finalBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });
  return new File([finalBuf], filename, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("pdf-parse", () => ({ default: realPdfParse }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("mammoth");
  vi.doUnmock("@/lib/core/prisma");
  vi.doUnmock("@/lib/profile/resume-parser");
  vi.doMock("pdf-parse", () => ({ default: realPdfParse }));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ============================================================================
// F6 — Mammoth DOCX Hardening (CVE-2025-11849, CVE-2026-97151)
// ============================================================================
describe("F6: Mammoth DOCX Hardening", () => {
  it("T1-F6-01: extracts plain text from valid programmatic DOCX File", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const file = await buildDocxFile({
      paragraphs: ["Jordan Ellis", "Operations Director"],
    });
    const text = await extractTextFromFile(file);
    expect(text).toContain("Jordan Ellis");
    expect(text).toContain("Operations Director");
  });

  it("T1-F6-02: preserves block structure across paragraphs, lists, and table cells", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const file = await buildDocxFile({
      paragraphs: ["Experience Summary"],
      listItems: ["Led cross-functional launch", "Reduced turnaround by 35%"],
      tableRows: [
        ["Category", "Detail"],
        ["Certification", "PMP"],
      ],
    });
    const text = await extractTextFromFile(file);
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(text).toContain("Experience Summary");
    expect(text).toContain("Led cross-functional launch");
    expect(text).toContain("Certification");
    expect(text).toContain("PMP");
  });

  it("T1-F6-03: decodes XML/HTML entities cleanly into plain characters", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const file = await buildDocxFile({
      paragraphs: [`R&D <Lead> "Quality" & 'Compliance'`],
    });
    const text = await extractTextFromFile(file);
    expect(text).toContain(`R&D <Lead> "Quality" & 'Compliance'`);
    expect(text).not.toContain("&amp;");
    expect(text).not.toContain("&lt;");
    expect(text).not.toContain("&gt;");
  });

  it("T1-F6-04: passes explicit externalFileAccess: false to mammoth.convertToHtml and strips embedded data URIs", async () => {
    vi.resetModules();
    const realMammoth = (await import("mammoth")).default;
    const convertSpy = vi.fn((input, options) =>
      realMammoth.convertToHtml(input, options)
    );

    vi.doMock("mammoth", () => ({
      default: {
        ...realMammoth,
        convertToHtml: convertSpy,
      },
    }));

    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const file = await buildDocxFile({
      paragraphs: ["Candidate Profile"],
      includeEmbeddedImage: true,
    });
    const text = await extractTextFromFile(file);

    expect(convertSpy).toHaveBeenCalledTimes(1);
    const callOptions = convertSpy.mock.calls[0][1];
    expect(callOptions).toBeDefined();
    expect(callOptions.externalFileAccess).toBe(false);
    expect(text).toContain("Candidate Profile");
    expect(text).not.toContain("data:image/");
  });

  it("T1-F6-05: detects .docx by filename extension when File.type is empty", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const file = await buildDocxFile(
      { paragraphs: ["Extension Fallback Ok"] },
      "candidate-cv.docx",
      ""
    );
    const text = await extractTextFromFile(file);
    expect(text).toContain("Extension Fallback Ok");
  });

  it("T2-F6-01: CVE-2025-11849 blocks r:link external file traversal without leaking host files", async () => {
    vi.resetModules();
    const realMammoth = (await import("mammoth")).default;
    const convertSpy = vi.fn((input, options) =>
      realMammoth.convertToHtml(input, options)
    );
    vi.doMock("mammoth", () => ({
      default: {
        ...realMammoth,
        convertToHtml: convertSpy,
      },
    }));

    const canaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailpilot-cve-"));
    const canaryPath = path.join(canaryDir, "secret.txt");
    const canarySecret = "MAILPILOT_CANARY_SECRET_TOKEN_987654";
    fs.writeFileSync(canaryPath, canarySecret, "utf8");

    try {
      const { extractTextFromFile } = await import(
        "@/lib/document/document-parser"
      );
      const file = await buildDocxFile({
        paragraphs: ["Benign Header"],
        externalLinkTarget: pathToFileURL(canaryPath).href,
        externalRelTargetMode: "External",
      });

      let text = "";
      try {
        text = await extractTextFromFile(file);
      } catch (err) {
        expect(String(err)).toMatch(/external file access is disabled/i);
      }
      expect(text).not.toContain(canarySecret);
      expect(text).not.toContain(Buffer.from(canarySecret).toString("base64"));
      expect(convertSpy).toHaveBeenCalled();
      expect(convertSpy.mock.calls[0][1]?.externalFileAccess).toBe(false);
    } finally {
      fs.rmSync(canaryDir, { recursive: true, force: true });
    }
  });

  it("T2-F6-02: CVE-2026-97151 neutralizes __proto__ / constructor style prototype-pollution payloads", async () => {
    vi.resetModules();
    const realMammoth = (await import("mammoth")).default;
    const convertSpy = vi.fn((input, options) =>
      realMammoth.convertToHtml(input, options)
    );
    vi.doMock("mammoth", () => ({
      default: {
        ...realMammoth,
        convertToHtml: convertSpy,
      },
    }));

    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const file = await buildDocxFile({
      paragraphs: ["Safe Body Content"],
      externalLinkTarget: "file:///etc/passwd",
      externalRelTargetMode: "External",
      polluteStyles: true,
    });

    const text = await extractTextFromFile(file);
    expect(text).toContain("Safe Body Content");
    expect({}.externalFileAccess).toBeUndefined();
    expect({}.polluted).toBeUndefined();
    expect(convertSpy).toHaveBeenCalled();
    expect(convertSpy.mock.calls[0][1]?.externalFileAccess).toBe(false);
  });

  it("T2-F6-03: rejects 0-byte empty DOCX before invoking mammoth", async () => {
    vi.resetModules();
    const convertSpy = vi.fn();
    vi.doMock("mammoth", () => ({
      default: {
        convertToHtml: convertSpy,
        extractRawText: convertSpy,
        images: { imgElement: vi.fn(() => () => ({ src: "" })) },
      },
    }));

    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const emptyDocx = new File([Buffer.alloc(0)], "empty.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(extractTextFromFile(emptyDocx)).rejects.toThrow(/empty/i);
    expect(convertSpy).not.toHaveBeenCalled();
  });

  it("T2-F6-04: allows exact 5 MB DOCX and rejects 5 MB + 1 byte DOCX before buffering/parsing", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );

    const exact5MbFile = await buildExactSizeDocxFile(FIVE_MB, "exact5mb.docx");
    expect(exact5MbFile.size).toBe(FIVE_MB);
    const text = await extractTextFromFile(exact5MbFile);
    expect(text).toContain("Exact Size Candidate");

    const overBytes = Buffer.alloc(FIVE_MB + 1, 0x50);
    const overFile = new File([overBytes], "over5mb.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const arrayBufferSpy = vi.spyOn(overFile, "arrayBuffer");

    await expect(extractTextFromFile(overFile)).rejects.toThrow(
      /5\s*MB|size|large|exceed/i
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("T2-F6-05: rejects hung DOCX parse at timeout and cleans up timer", async () => {
    const file = await buildDocxFile({ paragraphs: ["Slow DOCX"] });
    vi.useFakeTimers();
    vi.resetModules();

    vi.doMock("mammoth", () => ({
      default: {
        convertToHtml: () => new Promise(() => {}),
        extractRawText: () => new Promise(() => {}),
        images: { imgElement: () => () => ({ src: "" }) },
      },
    }));

    const { extractTextFromFile, DOCUMENT_PARSE_TIMEOUT_MS } = await import(
      "@/lib/document/document-parser"
    );
    expect(DOCUMENT_PARSE_TIMEOUT_MS).toBe(5_000);

    const settled = extractTextFromFile(file).then(
      () => "RESOLVED_WITHOUT_TIMEOUT",
      (err) => err
    );

    await vi.advanceTimersByTimeAsync(5_001);
    const error = await Promise.race([
      settled,
      Promise.resolve("DID_NOT_TIMEOUT_IN_5001MS"),
    ]);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/timed out|timeout/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T2-F6-06: rejects corrupt non-ZIP .docx and unsupported file extensions cleanly", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );

    const badDocx = new File(
      [Buffer.from("not-a-valid-zip-archive")],
      "corrupt.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    );
    await expect(extractTextFromFile(badDocx)).rejects.toThrow(Error);

    const exeFile = new File([Buffer.from("MZ")], "resume.exe", {
      type: "application/octet-stream",
    });
    await expect(extractTextFromFile(exeFile)).rejects.toThrow(
      "Unsupported file type. Please upload a PDF, DOCX, or TXT resume."
    );
  });
});

// ============================================================================
// F7 — PDF Parser Safeguards
// ============================================================================
describe("F7: PDF Parser Safeguards", () => {
  it("T1-F7-01: extracts trimmed text from minimal valid single-page PDF buffer & File", async () => {
    const { parsePdfBuffer, extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const pdfBuf = buildMinimalPdfBuffer(1);
    const fromBuf = await parsePdfBuffer(pdfBuf);
    expect(fromBuf).toContain("PAGE_1_SENTINEL");
    expect(fromBuf).toBe(fromBuf.trim());

    const fromFile = await extractTextFromFile(buildPdfFile(pdfBuf));
    expect(fromFile).toContain("PAGE_1_SENTINEL");
  });

  it("T1-F7-02: extracts all pages from multi-page PDF within MAX_PDF_PAGES", async () => {
    const { parsePdfBuffer } = await import("@/lib/document/document-parser");
    const pdfBuf = buildMinimalPdfBuffer(3);
    const text = await parsePdfBuffer(pdfBuf);
    expect(text).toContain("PAGE_1_SENTINEL");
    expect(text).toContain("PAGE_2_SENTINEL");
    expect(text).toContain("PAGE_3_SENTINEL");
  });

  it("T1-F7-03: exports required safeguard constants (5 MB, 5000 ms, 50 pages)", async () => {
    const parser = await import("@/lib/document/document-parser");
    expect(parser.MAX_DOCUMENT_BYTES).toBe(5 * 1024 * 1024);
    expect(parser.DOCUMENT_PARSE_TIMEOUT_MS).toBe(5_000);
    expect(parser.MAX_PDF_PAGES).toBe(50);
  });

  it("T1-F7-04: extracts trimmed UTF-8 text from valid TXT File", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const txtFile = new File(["   Candidate Plain Text Resume   \n"], "cv.txt", {
      type: "text/plain",
    });
    const text = await extractTextFromFile(txtFile);
    expect(text).toBe("Candidate Plain Text Resume");
  });

  it("T1-F7-05: profile-sync.service extractResumeDraft processes valid PDF into { ok: true, data }", async () => {
    vi.resetModules();
    vi.doMock("@/lib/core/prisma", () => ({
      prisma: {
        account: {
          findUnique: vi.fn(async () => ({
            id: "acc_1",
            email: "candidate@example.com",
            settings: {
              llmProvider: "OPENROUTER",
              localOllamaUrl: null,
              ollamaModel: null,
              rules: {},
            },
          })),
        },
      },
    }));
    vi.doMock("@/lib/profile/resume-parser", () => ({
      parseResumeToStructuredProfile: vi.fn(async () => ({
        fullName: "Jordan Ellis",
        email: "candidate@example.com",
        phone: null,
        location: null,
        summary: null,
        links: [],
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      })),
    }));

    const { extractResumeDraft } = await import(
      "@/lib/services/profile-sync.service"
    );
    const pdfBuf = buildMinimalPdfBuffer(1);
    const formData = new FormData();
    formData.set("accountId", "acc_1");
    formData.set("file", buildPdfFile(pdfBuf, "resume.pdf"));

    const res = await extractResumeDraft(formData);
    expect(res.ok).toBe(true);
    expect(res.data?.sourceText).toContain("PAGE_1_SENTINEL");
    expect(res.data?.profile.fullName).toBe("Jordan Ellis");
  });

  it("T2-F7-01: rejects 0-byte PDF buffer and 0-byte PDF File without calling pdf-parse", async () => {
    vi.resetModules();
    const pdfParseSpy = vi.fn();
    vi.doMock("pdf-parse", () => ({ default: pdfParseSpy }));

    const { parsePdfBuffer, extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    await expect(parsePdfBuffer(Buffer.alloc(0))).rejects.toThrow(/empty/i);
    await expect(
      extractTextFromFile(buildPdfFile(Buffer.alloc(0), "empty.pdf"))
    ).rejects.toThrow(/empty/i);
    expect(pdfParseSpy).not.toHaveBeenCalled();
  });

  it("T2-F7-02: allows exact 5 MB PDF and rejects 5 MB + 1 byte PDF before arrayBuffer() / pdfParse", async () => {
    const { parsePdfBuffer, extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );

    const exact5MbBuf = buildMinimalPdfBuffer(1, { padToBytes: FIVE_MB });
    expect(exact5MbBuf.length).toBe(FIVE_MB);
    const okText = await parsePdfBuffer(exact5MbBuf);
    expect(okText).toContain("PAGE_1_SENTINEL");

    const overBuf = Buffer.alloc(FIVE_MB + 1, 0x25);
    await expect(parsePdfBuffer(overBuf)).rejects.toThrow(
      /5\s*MB|size|large|exceed/i
    );

    const overFile = buildPdfFile(overBuf, "huge.pdf");
    const abSpy = vi.spyOn(overFile, "arrayBuffer");
    await expect(extractTextFromFile(overFile)).rejects.toThrow(
      /5\s*MB|size|large|exceed/i
    );
    expect(abSpy).not.toHaveBeenCalled();
  });

  it("T2-F7-03: resolves fast PDF parse & cleans up timer, and rejects hung parse at 5,000 ms", async () => {
    vi.useFakeTimers();
    vi.resetModules();

    let mode = "fast";
    vi.doMock("pdf-parse", () => ({
      default: vi.fn(
        () =>
          new Promise((resolve) => {
            if (mode === "fast") {
              setTimeout(() => resolve({ text: "Fast PDF Text" }), 10);
            }
          })
      ),
    }));

    const { parsePdfBuffer } = await import("@/lib/document/document-parser");

    const fastPromise = parsePdfBuffer(buildMinimalPdfBuffer(1));
    await vi.advanceTimersByTimeAsync(11);
    await expect(fastPromise).resolves.toBe("Fast PDF Text");
    expect(vi.getTimerCount()).toBe(0);

    mode = "hang";
    const hangPromise = parsePdfBuffer(buildMinimalPdfBuffer(1)).then(
      () => "RESOLVED_WITHOUT_TIMEOUT",
      (err) => err
    );
    await vi.advanceTimersByTimeAsync(5_001);
    const err = await Promise.race([
      hangPromise,
      Promise.resolve("DID_NOT_TIMEOUT_IN_5001MS"),
    ]);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/timed out|timeout/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T2-F7-04: caps PDF extraction at MAX_PDF_PAGES (50) on a real 55-page PDF", async () => {
    const { parsePdfBuffer } = await import("@/lib/document/document-parser");
    const pdf55 = buildMinimalPdfBuffer(55);
    const text = await parsePdfBuffer(pdf55);

    expect(text).toContain("PAGE_1_SENTINEL");
    expect(text).toContain("PAGE_50_SENTINEL");
    expect(text).not.toContain("PAGE_51_SENTINEL");
    expect(text).not.toContain("PAGE_55_SENTINEL");
  });

  it("T2-F7-05: handles corrupt non-PDF buffer cleanly without unhandled crash", async () => {
    vi.resetModules();
    vi.doMock("@/lib/core/prisma", () => ({
      prisma: {
        account: {
          findUnique: vi.fn(async () => ({
            id: "acc_1",
            email: "candidate@example.com",
            settings: null,
          })),
        },
      },
    }));

    const { parsePdfBuffer } = await import("@/lib/document/document-parser");
    const { extractResumeDraft } = await import(
      "@/lib/services/profile-sync.service"
    );

    const garbage = Buffer.from("%PDF-1.4\nnot-a-real-xref-" + "x".repeat(4500));
    await expect(parsePdfBuffer(garbage)).rejects.toThrow(Error);

    const fd = new FormData();
    fd.set("accountId", "acc_1");
    fd.set("file", buildPdfFile(garbage, "corrupt.pdf"));
    const res = await extractResumeDraft(fd);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error.length).toBeGreaterThan(0);
  });

  it("T2-F7-06: extractResumeDraft rejects > 5 MB upload BEFORE calling file.arrayBuffer()", async () => {
    vi.resetModules();
    vi.doMock("@/lib/core/prisma", () => ({
      prisma: {
        account: {
          findUnique: vi.fn(async () => ({
            id: "acc_1",
            email: "candidate@example.com",
            settings: {
              llmProvider: "OPENROUTER",
              localOllamaUrl: null,
              ollamaModel: null,
              rules: {},
            },
          })),
        },
      },
    }));

    const { extractResumeDraft } = await import(
      "@/lib/services/profile-sync.service"
    );

    const hugeFile = buildPdfFile(Buffer.alloc(FIVE_MB + 1, 0x41), "huge.pdf");
    const abSpy = vi
      .spyOn(hugeFile, "arrayBuffer")
      .mockRejectedValue(new Error("Should never buffer oversized file"));

    const formData = new FormData();
    formData.set("accountId", "acc_1");
    formData.set("file", hugeFile);

    const res = await extractResumeDraft(formData);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/5\s*MB|size|large|exceed/i);
    expect(abSpy).not.toHaveBeenCalled();
  });
});
