"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { exportMasterProfilePdfAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";

type ExportMasterResumeButtonProps = {
  accountId: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
};

/**
 * Downloads the unpruned Master Profile as a standalone, comprehensive PDF
 * without consuming LLM tokens.
 */
export function ExportMasterResumeButton({
  accountId,
  variant = "outline",
  size = "sm",
  className,
  label = "Export Master Resume",
}: ExportMasterResumeButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await exportMasterProfilePdfAction(accountId);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Export failed: No PDF generated" : res.error);
        return;
      }

      const { pdfBase64, filename } = res.data;
      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteNumbers], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast.success("Master resume exported successfully");
    } catch (err) {
      console.error("Export master resume failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to export PDF"
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={isExporting}
      onClick={handleExport}
    >
      {isExporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
