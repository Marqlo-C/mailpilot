"use client";

import { useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { exportMasterProfilePdfAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExportMasterProfileButtonProps = {
  accountId: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
};

export type ExportMasterResumeButtonProps = ExportMasterProfileButtonProps;

/**
 * Downloads the unpruned Master Profile as a standalone, comprehensive PDF
 * without consuming LLM tokens.
 */
export function ExportMasterProfileButton({
  accountId,
  variant = "outline",
  size = "sm",
  className,
  label = "Export Master Profile",
}: ExportMasterProfileButtonProps) {
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

      toast.success("Master profile exported successfully");
    } catch (err) {
      console.error("Export master profile failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to export master profile PDF"
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
      className={cn("gap-2 [&_svg]:size-3.5 [&_svg]:shrink-0", className)}
      disabled={isExporting}
      onClick={handleExport}
    >
      {isExporting ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <CloudDownload className="size-3.5 shrink-0" />
      )}
      {label}
    </Button>
  );
}

export const ExportMasterResumeButton = ExportMasterProfileButton;
