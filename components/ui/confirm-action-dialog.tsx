"use client";

import type { ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { ActionDialogShell } from "@/components/ui/action-dialog-shell";
import {
  PRIMARY_ACTION_BTN_CLASSNAME,
  PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/primary-action-btn";
import { cn } from "@/lib/utils";

type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Present-progressive identity title, e.g. "Deleting record for:".
   * See DialogIdentityHeader title syntax.
   */
  title: string;
  primary: string;
  secondary?: string | null;
  logoSrc?: string | null;
  logoName?: string;
  /** Replaces the company mark (for example the MailPilot logo). */
  logo?: ReactNode;
  /** Muted lead copy (unsubscribe-style info line). */
  description?: string;
  /** Emphasized follow-up under the lead. */
  emphasis?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  /** When true, filled red primary CTA + trash icon; otherwise dark primary. */
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Shared confirm dialog for irreversible actions.
 * Built on ActionDialogShell; default body mirrors the unsubscribe info pattern.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  primary,
  secondary = null,
  logoSrc = null,
  logoName,
  logo,
  description = "This action cannot be reversed.",
  emphasis = "Are you sure? This can't be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  destructive = true,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      size="lg"
      identity={{
        title,
        primary,
        secondary,
        logoSrc,
        logoName: logoName ?? primary,
        logo,
        logoSize: "lg",
      }}
      cancelLabel={cancelLabel}
      primaryAction={
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className={cn(
            destructive
              ? PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME
              : PRIMARY_ACTION_BTN_CLASSNAME,
            "h-9 px-3.5"
          )}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : destructive ? (
            <Trash2 className="h-3.5 w-3.5" />
          ) : null}
          <span>{confirmLabel}</span>
        </button>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{description}</p>
        {emphasis ? (
          <p className="text-sm font-semibold text-foreground">{emphasis}</p>
        ) : null}
      </div>
    </ActionDialogShell>
  );
}
