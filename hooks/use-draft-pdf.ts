"use client";

import { useEffect, useState } from "react";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function pdfBase64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export function downloadBase64File(
  filename: string,
  base64: string,
  mime: string
) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useDraftPdf(pdfBase64?: string | null) {
  const [resumePdfUrl, setResumePdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfBase64) {
      setResumePdfUrl(null);
      return;
    }
    const url = pdfBase64ToBlobUrl(pdfBase64);
    setResumePdfUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdfBase64]);

  return {
    resumePdfUrl,
    pdfBase64ToBlobUrl,
    downloadBase64File,
    formatSize,
    estimateBase64Bytes,
  };
}
