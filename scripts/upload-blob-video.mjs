#!/usr/bin/env node

/**
 * Utility script to upload optimized login background video & poster to Vercel Blob storage.
 *
 * Usage:
 *   node scripts/upload-blob-video.mjs [BLOB_READ_WRITE_TOKEN]
 *
 * Or if BLOB_READ_WRITE_TOKEN is in .env.local:
 *   node scripts/upload-blob-video.mjs
 */

import { put } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const token = process.argv[2] || process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error("Error: BLOB_READ_WRITE_TOKEN is required.");
  console.error("Provide it as an argument or set it in .env.local:");
  console.error("  node scripts/upload-blob-video.mjs <token>");
  process.exit(1);
}

const assets = [
  {
    local: "public/videos/login-bg-fast.mp4",
    blobName: "color-spin-trimmed-comp.mp4",
    contentType: "video/mp4",
  },
  {
    local: "public/videos/login-bg-poster.webp",
    blobName: "color-spin-poster.webp",
    contentType: "image/webp",
  },
];

async function upload() {
  for (const asset of assets) {
    const fullPath = path.resolve(process.cwd(), asset.local);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found: ${fullPath}, skipping...`);
      continue;
    }

    console.log(`Uploading ${asset.local} -> Blob "${asset.blobName}"...`);
    const fileBuffer = fs.readFileSync(fullPath);
    const result = await put(asset.blobName, fileBuffer, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: asset.contentType,
      token,
    });

    console.log(`✓ Uploaded ${asset.blobName} successfully: ${result.url}`);
  }
}

upload().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
