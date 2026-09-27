import type { NextConfig } from "next";

const pdfkitAssets = [
  "./node_modules/pdfkit/js/standard-fonts/**/*",
  "./node_modules/pdfkit/js/data/**/*",
];

const pdfjsAssets = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
];

const nextConfig: NextConfig = {
  // Keep document packages external so Node resolves them from node_modules
  // (avoids broken bundled worker / font paths in Vercel lambdas).
  serverExternalPackages: [
    "pdfkit",
    "pdf-parse",
    "pdfjs-dist",
    "@react-pdf/renderer",
    "mammoth",
  ],
  // Force Vercel file tracing to copy pdfkit fonts (+ pdfjs workers) into functions.
  outputFileTracingIncludes: {
    "/api/**/*": [...pdfkitAssets, ...pdfjsAssets],
    "/**/*": [...pdfkitAssets, ...pdfjsAssets],
    "/*": [...pdfkitAssets, ...pdfjsAssets],
  },
};

export default nextConfig;
