import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep PDF / DOCX parsers external so Node resolves them from node_modules
  // instead of bundling broken worker paths into the serverless function.
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@react-pdf/renderer",
    "mammoth",
  ],
  // Include pdfjs worker assets if any transitive dependency still resolves them.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
    ],
    "/*": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
    ],
  },
};

export default nextConfig;
