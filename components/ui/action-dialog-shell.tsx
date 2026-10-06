"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  DialogIdentityHeader,
  type DialogIdentityHeaderProps,
} from "@/components/ui/dialog-identity-header";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-3xl",
} as const;

export type ActionDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blocks dismiss while true (e.g. request in flight). */
  pending?: boolean;
  /** Dialog width token. */
  size?: keyof typeof SIZE_CLASS;
  /**
   * Identity header props — present-progressive title + primary • secondary.
   * See DialogIdentityHeader.
   */
  identity: DialogIdentityHeaderProps;
  /** Middle section: copy, forms, radios, previews, etc. */
  children: ReactNode;
  /** When false, omit the ghost Cancel control (e.g. Close-only footers). */
  showCancel?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
  /** Optional outline / destructive secondary CTA (left of primary). */
  secondaryAction?: ReactNode;
  /** Required primary CTA for the dialog’s main action. */
  primaryAction?: ReactNode;
  /** Optional ⋮ overflow trigger (right of primary). */
  overflowMenu?: ReactNode;
  contentClassName?: string;
};

/**
 * Shared action-popup layout used across Subscriptions (and similar flows):
 *
 * 1. DialogIdentityHeader
 * 2. Scrollable middle (actions / content)
 * 3. Footer L→R: optional Cancel · optional secondary CTA · primary CTA · optional ⋮
 */
export function ActionDialogShell({
  open,
  onOpenChange,
  pending = false,
  size = "md",
  identity,
  children,
  showCancel = true,
  cancelLabel = "Cancel",
  onCancel,
  secondaryAction,
  primaryAction,
  overflowMenu,
  contentClassName,
}: ActionDialogShellProps) {
  function handleOpenChange(next: boolean) {
    if (pending) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0",
          SIZE_CLASS[size],
          contentClassName
        )}
      >
        <DialogIdentityHeader {...identity} />

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-4">
          {children}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-muted/20 px-6 py-3">
          {showCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              disabled={pending}
              onClick={() => {
                if (onCancel) onCancel();
                else onOpenChange(false);
              }}
            >
              {cancelLabel}
            </Button>
          ) : null}
          {secondaryAction}
          {primaryAction}
          {overflowMenu}
        </div>
      </DialogContent>
    </Dialog>
  );
}
