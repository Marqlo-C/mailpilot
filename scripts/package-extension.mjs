import fs from "fs";
import path from "path";
import crypto from "crypto";
import JSZip from "jszip";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "extension", "dist");
const outputZipRoot = path.join(rootDir, "mailpilot-extension.zip");
const publicDownloadsDir = path.join(rootDir, "public", "downloads");
const outputZipPublic = path.join(publicDownloadsDir, "mailpilot-extension.zip");

async function addDirectoryToZip(zip, folderPath, relativePrefix = "") {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    const zipPath = path.join(relativePrefix, entry.name).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      const subFolder = zip.folder(entry.name);
      await addDirectoryToZip(subFolder, fullPath, zipPath);
    } else {
      const fileData = fs.readFileSync(fullPath);
      zip.file(entry.name, fileData);
    }
  }
}

async function packageExtension() {
  console.log("📦 Packaging Mail Pilot + Companion...");

  if (!fs.existsSync(distDir)) {
    console.error("❌ extension/dist directory not found. Please run 'npm run build:extension' first.");
    process.exit(1);
  }

  const manifestPath = path.join(distDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("❌ manifest.json not found in extension/dist.");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`ℹ️  Found extension: ${manifest.name} v${manifest.version}`);

  const zip = new JSZip();
  await addDirectoryToZip(zip, distDir);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  // Write to root for GitHub CI release asset
  fs.writeFileSync(outputZipRoot, zipBuffer);

  // Write to public/downloads for web dashboard direct download
  if (!fs.existsSync(publicDownloadsDir)) {
    fs.mkdirSync(publicDownloadsDir, { recursive: true });
  }
  fs.writeFileSync(outputZipPublic, zipBuffer);

  const hash = crypto.createHash("sha256").update(zipBuffer).digest("hex");
  const sizeKb = (zipBuffer.byteLength / 1024).toFixed(1);

  console.log(`✅ Extension successfully packaged!`);
  console.log(`   📁 Output 1: ${outputZipRoot} (${sizeKb} KB)`);
  console.log(`   📁 Output 2: ${outputZipPublic} (${sizeKb} KB)`);
  console.log(`   🔑 SHA-256:  ${hash}`);
}

packageExtension().catch((err) => {
  console.error("❌ Error packaging extension:", err);
  process.exit(1);
});
