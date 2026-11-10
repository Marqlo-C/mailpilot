import type { Subscription } from "@prisma/client";
import { Loader2, UserRoundMinus } from "lucide-react";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { DialogIdentityLogoStack } from "@/components/ui/composites/dialog-identity-header";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import type { CleanupAction } from "@/lib/gmail/unsubscribe";
import { cn } from "@/lib/utils";
import { senderLogoSrc } from "./types";

export const UNSUBSCRIBE_OPTIONS: {
  value: CleanupAction;
  label: string;
  description: string;
}[] = [
  {
    value: "NONE",
    label: "Keep",
    description: "Leave your inbox alone.",
  },
  {
    value: "ARCHIVE",
    label: "Archive",
    description: "Remove them from Inbox; they stay in All Mail / Archive.",
  },
  {
    value: "TRASH",
    label: "Delete",
    description: "Move past mail from this sender to Trash.",
  },
];

export function UnsubscribeCleanupDialog({
  open,
  onClose,
  pending,
  batchConfirmOpen,
  selectedIds,
  selectedSubscriptions,
  selected,
  cleanupChoice,
  onCleanupChoiceChange,
  onConfirm,
  error,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  batchConfirmOpen: boolean;
  selectedIds: string[];
  selectedSubscriptions: Subscription[];
  selected: Subscription | null;
  cleanupChoice: CleanupAction;
  onCleanupChoiceChange: (choice: CleanupAction) => void;
  onConfirm: () => void;
  error: string | null;
}) {
  return (
    <ActionDialogShell
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      pending={pending}
      size="sm"
      identity={{
        title: "Unsubscribing from:",
        primary: batchConfirmOpen
          ? `${selectedIds.length} selected sender${selectedIds.length === 1 ? "" : "s"}`
          : (selected?.senderEmail ?? "sender"),
        secondary: batchConfirmOpen ? null : (selected?.senderName ?? null),
        logo: batchConfirmOpen ? (
          <DialogIdentityLogoStack
            size="lg"
            items={selectedSubscriptions.map((sub) => ({
              key: sub.id,
              src: senderLogoSrc(sub.senderEmail),
              name: sub.senderName ?? sub.senderEmail,
            }))}
          />
        ) : selected ? (
          <CompanyLogo
            src={senderLogoSrc(selected.senderEmail)}
            name={selected.senderName ?? selected.senderEmail}
            size="lg"
          />
        ) : undefined,
      }}
      onCancel={onClose}
      primaryAction={
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserRoundMinus className="h-3.5 w-3.5" />
          )}
          <span>{pending ? "Working…" : "Unsubscribe"}</span>
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {batchConfirmOpen
            ? "Future emails from these senders will be blocked."
            : "Future emails from this sender will be blocked."}
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            What would you like to do with past emails?
          </p>
          <div
            className="overflow-hidden rounded-lg border border-border/60 bg-muted/20"
            role="radiogroup"
            aria-label="Past email cleanup"
          >
            {UNSUBSCRIBE_OPTIONS.map((option, index) => {
              const selectedOption = cleanupChoice === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selectedOption}
                  disabled={pending}
                  onClick={() => onCleanupChoiceChange(option.value)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors disabled:opacity-50",
                    index > 0 && "border-t border-border/50",
                    selectedOption
                      ? "bg-background"
                      : "hover:bg-background/70"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      selectedOption
                        ? "border-[#1ab5af] bg-[#1ab5af]"
                        : "border-muted-foreground/40"
                    )}
                    aria-hidden
                  >
                    {selectedOption ? (
                      <span className="size-1.5 rounded-full bg-white" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </ActionDialogShell>
  );
}
