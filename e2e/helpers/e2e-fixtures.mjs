import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import JSZip from "jszip";

const requireFromHere = createRequire(import.meta.url);

/**
 * Loads pdf-parse via Node CJS require so `module.parent` is populated
 * (avoids pdf-parse/index.js debug-mode `./test/data/05-versions-space.pdf` read).
 */
export const realPdfParse = requireFromHere("pdf-parse");

export const ROOT_DIR = path.resolve(import.meta.dirname, "..", "..");

export const TEST_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Resolves a path relative to the MailPilot repository root.
 */
export function resolveRoot(...segments) {
  return path.resolve(ROOT_DIR, ...segments);
}

/**
 * Returns true if the target path exists relative to the repository root.
 */
export function fileExists(...segments) {
  return fs.existsSync(resolveRoot(...segments));
}

/**
 * Reads a UTF-8 text file relative to the repository root.
 */
export function readTextFile(...segments) {
  return fs.readFileSync(resolveRoot(...segments), "utf8");
}

/**
 * Reads and parses a JSON file relative to the repository root.
 */
export function readJsonFile(...segments) {
  return JSON.parse(readTextFile(...segments));
}

/**
 * Reads the root package.json manifest.
 */
export function readRootPackageJson() {
  return readJsonFile("package.json");
}

/**
 * Reads an installed package's package.json inside node_modules.
 * Returns null if not installed.
 */
export function readInstalledPackageJson(pkgName) {
  const pkgPath = resolveRoot("node_modules", ...pkgName.split("/"), "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

/**
 * Parses a semver or semver-range string into
 * { major, minor, patch, raw, prerelease, prereleaseIds }.
 */
export function parseSemver(versionStr) {
  if (typeof versionStr !== "string") return null;
  const cleaned = versionStr.trim().replace(/^[~^>=<\s]+/, "");
  const match = cleaned.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
  );
  if (!match) return null;
  const prereleaseStr = match[4] ?? null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: versionStr.trim(),
    prerelease: Boolean(prereleaseStr),
    prereleaseIds: prereleaseStr ? prereleaseStr.split(".") : [],
  };
}

/**
 * Compares two semver strings using SemVer 2.0.0 precedence:
 * -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(aStr, bStr) {
  const a = parseSemver(aStr);
  const b = parseSemver(bStr);
  if (!a || !b) {
    throw new Error(`Invalid semver comparison: "${aStr}" vs "${bStr}"`);
  }
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  if (!a.prerelease && !b.prerelease) return 0;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;

  const maxLen = Math.max(a.prereleaseIds.length, b.prereleaseIds.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= a.prereleaseIds.length) return -1;
    if (i >= b.prereleaseIds.length) return 1;
    const idA = a.prereleaseIds[i];
    const idB = b.prereleaseIds[i];
    if (idA === idB) continue;

    const isNumA = /^\d+$/.test(idA);
    const isNumB = /^\d+$/.test(idB);
    if (isNumA && isNumB) {
      const nA = Number(idA);
      const nB = Number(idB);
      if (nA !== nB) return nA < nB ? -1 : 1;
      continue;
    }
    if (isNumA !== isNumB) {
      return isNumA ? -1 : 1;
    }
    return idA < idB ? -1 : 1;
  }
  return 0;
}

export function gteSemver(actual, floor) {
  return compareSemver(actual, floor) >= 0;
}

export function ltSemver(actual, ceiling) {
  return compareSemver(actual, ceiling) < 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds a valid in-memory DOCX buffer via JSZip.
 * Supports benign blocks/entities, external r:link relationships (CVE-2025-11849),
 * embedded images, and prototype-pollution style payloads (CVE-2026-97151).
 */
export async function buildDocxBuffer({
  paragraphs = ["Jordan Ellis", "Senior Operations Lead"],
  listItems = [],
  tableRows = [],
  externalLinkTarget = null,
  externalRelTargetMode = "External",
  includeEmbeddedImage = false,
  polluteStyles = false,
} = {}) {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const relsEntries = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ];

  if (externalLinkTarget) {
    relsEntries.push(
      `<Relationship Id="rIdExt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${escapeXml(externalLinkTarget)}" TargetMode="${escapeXml(externalRelTargetMode)}"/>`
    );
  }

  if (includeEmbeddedImage) {
    // 1x1 transparent PNG
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );
    zip.file("word/media/tiny.png", tinyPng);
    relsEntries.push(
      `<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tiny.png"/>`
    );
  }

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relsEntries.join("\n  ")}
</Relationships>`
  );

  const extraStyles = polluteStyles
    ? `
  <w:style w:type="paragraph" w:styleId="__proto__">
    <w:name w:val="externalFileAccess"/>
  </w:style>
  <w:style w:type="character" w:styleId="constructor">
    <w:name w:val="prototype"/>
  </w:style>`
    : "";

  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>${extraStyles}
</w:styles>`
  );

  const bodyParts = [];

  for (const p of paragraphs) {
    bodyParts.push(
      `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`
    );
  }

  for (const item of listItems) {
    bodyParts.push(
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${escapeXml(item)}</w:t></w:r></w:p>`
    );
  }

  if (tableRows.length > 0) {
    const rowsXml = tableRows
      .map(
        (cells) =>
          `<w:tr>${cells
            .map((cell) => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`)
            .join("")}</w:tr>`
      )
      .join("");
    bodyParts.push(`<w:tbl>${rowsXml}</w:tbl>`);
  }

  const wrapInlinePicture = (docPrId, name, blipAttrs) =>
    `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="${docPrId}" name="${name}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ${blipAttrs}/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  if (externalLinkTarget) {
    bodyParts.push(wrapInlinePicture(1, "External Image", 'r:link="rIdExt"'));
  }

  if (includeEmbeddedImage) {
    bodyParts.push(wrapInlinePicture(2, "Embedded Image", 'r:embed="rIdImg"'));
  }

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join("\n    ")}
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Creates a Web File wrapping a programmatic DOCX buffer.
 */
export async function buildDocxFile(
  options = {},
  filename = "resume.docx",
  mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
) {
  const buf = await buildDocxBuffer(options);
  return new File([buf], filename, { type: mime });
}

/**
 * Generates a minimal valid PDF 1.4 buffer with `pageCount` pages.
 * Pads PDFs smaller than `padToBytes` (default 4,500 B) using a `%` comment
 * before object 1 so Node 20 pdfjs v1.10.100 never hits the `<4 KB Buffer`
 * `bad XRef entry` bug.
 */
export function buildMinimalPdfBuffer(
  pageCount = 1,
  { padToBytes = 4500, textPrefix = "PAGE" } = {}
) {
  const safeCount = Math.max(1, pageCount);
  const objects = [];
  const pageObjectIds = [];

  // Object 1: Catalog, Object 2: Pages, Object 3: Font
  const fontId = 3;
  const firstPageId = 4;

  for (let i = 0; i < safeCount; i++) {
    pageObjectIds.push(firstPageId + i * 2);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${safeCount} >>\nendobj\n`
  );
  objects.push(
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  );

  for (let i = 0; i < safeCount; i++) {
    const pageId = firstPageId + i * 2;
    const contentId = pageId + 1;
    const pageNum = i + 1;
    const line = `${textPrefix}_${pageNum}_SENTINEL Candidate Profile Line ${pageNum}`;
    const streamBody = `BT\n/F1 12 Tf\n72 720 Td\n(${line}) Tj\nET\n`;

    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(streamBody, "utf8")} >>\nstream\n${streamBody}endstream\nendobj\n`
    );
  }

  const buildWithPad = (padLen) => {
    const padLine = padLen > 0 ? `% ${"x".repeat(padLen)}\n` : "";
    let pdf = `%PDF-1.4\n${padLine}`;
    const offsets = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += obj;
    }
    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${offsets.length}\n`;
    pdf += `0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, "utf8");
  };

  let buf = buildWithPad(0);
  if (buf.length < padToBytes) {
    let padLen = padToBytes - buf.length - 3;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (padLen < 0) padLen = 0;
      buf = buildWithPad(padLen);
      const diff = padToBytes - buf.length;
      if (diff === 0) break;
      padLen += diff;
    }
  }
  return buf;
}

/**
 * Creates a Web File wrapping a PDF buffer.
 */
export function buildPdfFile(
  buffer,
  filename = "resume.pdf",
  mime = "application/pdf"
) {
  return new File([buffer], filename, { type: mime });
}

/**
 * Starts an ephemeral 127.0.0.1:0 HTTP server mocking Ollama endpoints
 * (/api/tags, /api/version, /api/generate NDJSON stream, /api/embeddings).
 */
export async function startMockOllamaServer({
  models = ["llama3.1:8b", "nomic-embed-text"],
  generatePayload = { role: "Product Analyst", skills: ["Analytics", "SQL"] },
  streamChunks = 3,
  chunkDelayMs = 5,
  embeddingVector = [0.1, 0.2, 0.3],
} = {}) {
  const requests = [];

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      body: bodyText,
    });

    if (req.method === "GET" && req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: models.map((name) => ({ name })) }));
      return;
    }

    if (req.method === "GET" && req.url === "/api/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "0.6.2" }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/generate") {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      const serialized = JSON.stringify(generatePayload);
      const count = Math.max(1, streamChunks);
      const sliceSize = Math.ceil(serialized.length / count);

      for (let i = 0; i < count; i++) {
        const slice = serialized.slice(i * sliceSize, (i + 1) * sliceSize);
        const isLast = i === count - 1;
        res.write(`${JSON.stringify({ response: slice, done: isLast })}\n`);
        if (!isLast && chunkDelayMs > 0) {
          await new Promise((r) => setTimeout(r, chunkDelayMs));
        }
      }
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/embeddings") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ embedding: embeddingVector }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    requests,
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Starts an ephemeral 127.0.0.1:0 recording HTTP server (e.g., for attacker non-leakage checks).
 */
export async function startRecordingHttpServer(statusCode = 200, jsonBody = { models: [] }) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    requests.push({
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonBody));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    requests,
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Returns a local 127.0.0.1 URL whose port was bound and immediately closed.
 */
export async function getClosedLocalUrl() {
  const srv = http.createServer();
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  await new Promise((resolve) => srv.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

/**
 * Generates a cryptographically random 64-char hex token.
 */
export function generateHexToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
