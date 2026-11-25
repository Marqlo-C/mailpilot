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
} from "@/components/ui/composites/dialog-identity-header";
import { ACTION_CTA_CLUSTER_GAP_CLASSNAME } from "@/components/ui/styles/action-button-styles";
import { cn } from "@/lib/utils";

/**
 * Dialog width scale (main-column aware for md/lg/xl — see `app/globals.css`):
 * - sm  ≈ 32rem (confirms / compact flows)
 * - md  ≈ midway between sm and lg (import resume, etc.)
 * - lg  = email-draft width (grows with sidebar collapse)
 * - xl  = resume-draft width (fills the main column)
 */
const SIZE_CLASS = {
  sm: "sm:max-w-lg",
  md: "mp-dialog-size-md",
  lg: "mp-dialog-size-lg",
  xl: "mp-dialog-size-xl",
} as const;

export type ActionDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blocks dismiss while true (e.g. request in flight). */
  pending?: boolean;
  /** Dialog width token. */
  size?: keyof typeof SIZE_CLASS;
  /**
   * Identity header props — title + primary • secondary.
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
  /** Leading footer slot (e.g. attach toggles) — sits left of Cancel/actions. */
  leadingFooter?: ReactNode;
  contentClassName?: string;
  /** Override the scrollable middle wrapper (e.g. flush custom layouts). */
  bodyClassName?: string;
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
  size = "sm",
  identity,
  children,
  showCancel = true,
  cancelLabel = "Cancel",
  onCancel,
  secondaryAction,
  primaryAction,
  overflowMenu,
  leadingFooter,
  contentClassName,
  bodyClassName,
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

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4",
            bodyClassName
          )}
        >
          {children}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-4">
          {leadingFooter ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {leadingFooter}
            </div>
          ) : null}
          <div
            className={cn(
              "ml-auto flex flex-wrap items-center justify-end",
              ACTION_CTA_CLUSTER_GAP_CLASSNAME
            )}
          >
            {showCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
