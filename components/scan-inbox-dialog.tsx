"use client";

import { SyncControls } from "@/components/opportunities/sync-controls";

type ScanInboxDialogProps = {
  accountId: string | null;
  className?: string;
};

/**
 * @deprecated Prefer SyncControls — kept as a thin alias for existing page imports.
 */
export function ScanInboxDialog({ accountId, className }: ScanInboxDialogProps) {
  return <SyncControls accountId={accountId} className={className} />;
}
