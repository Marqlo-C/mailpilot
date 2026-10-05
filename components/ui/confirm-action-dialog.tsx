"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Defaults to a universal irreversible warning. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  /** When true, confirm uses destructive styling. */
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Shared confirm dialog for irreversible actions.
 * Universal copy: “Are you sure? This can't be undone.”
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description = "Are you sure? This can't be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  destructive = true,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
