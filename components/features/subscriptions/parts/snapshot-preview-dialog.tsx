import type { Subscription } from "@prisma/client";
import { CirclePlus, Loader2, Trash2 } from "lucide-react";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { DialogIdentityLogoStack } from "@/components/ui/composites/dialog-identity-header";
import {
  formatPreviewDisplayDate,
  PreviewLoadChrome,
} from "@/components/features/subscriptions/preview-load-chrome";
import { constrainBriefingPreviewHtml } from "@/lib/subscriptions/digest-constants";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
import { cn } from "@/lib/utils";
import { senderLogoSrc, type ResolvedBriefing } from "./types";

export function SnapshotPreviewDialog({
  viewingBriefing,
  onClose,
  deletePending,
  onDelete,
  briefingPending,
  onNewBriefing,
  briefingPreviewLoading,
  onIframeLoad,
  active,
}: {
  viewingBriefing: ResolvedBriefing | null;
  onClose: () => void;
  deletePending: boolean;
  onDelete: (briefing: ResolvedBriefing) => void;
  briefingPending: boolean;
  onNewBriefing: () => void;
  briefingPreviewLoading: boolean;
  onIframeLoad: () => void;
  active: Subscription[];
}) {
  return (
    <ActionDialogShell
      open={Boolean(viewingBriefing)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      pending={deletePending}
      size="lg"
      identity={(() => {
        if (!viewingBriefing) {
          return {
            title: "Viewing snap for:",
            primary: "No snapshot available",
          };
        }
        const emails = viewingBriefing.senderEmails;
        const firstEmail = emails[0] ?? "";
        const firstName =
          active.find(
            (s) => s.senderEmail.toLowerCase() === firstEmail.toLowerCase()
          )?.senderName ?? null;
        const multi = emails.length > 1;
        return {
          title: "Viewing snap for:",
          primary: multi ? `${emails.length} senders` : firstEmail,
          secondary: multi
            ? new Date(viewingBriefing.generatedAt).toLocaleString()
            : firstName,
          logo: (
            <DialogIdentityLogoStack
              size="lg"
              items={emails.map((email) => ({
                key: email,
                src: senderLogoSrc(email),
                name:
                  active.find(
                    (s) => s.senderEmail.toLowerCase() === email.toLowerCase()
                  )?.senderName ?? email,
              }))}
            />
          ),
        };
      })()}
      cancelLabel="Close"
      secondaryAction={
        <button
          type="button"
          disabled={deletePending || !viewingBriefing}
          onClick={() => {
            if (!viewingBriefing) return;
            onDelete(viewingBriefing);
          }}
          className={cn(
            SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
            "h-9 px-3.5"
          )}
        >
          {deletePending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span>Delete</span>
        </button>
      }
      primaryAction={
        <button
          type="button"
          disabled={!viewingBriefing || briefingPending}
          onClick={onNewBriefing}
          className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
        >
          <CirclePlus className="h-3.5 w-3.5" />
          <span>New</span>
        </button>
      }
    >
      {viewingBriefing ? (
        <PreviewLoadChrome
          loading={briefingPreviewLoading}
          subject={
            viewingBriefing.subject?.trim() ||
            (viewingBriefing.senderEmails.length > 1
              ? `Snapshot · ${viewingBriefing.senderEmails.length} senders`
              : `Snapshot · ${viewingBriefing.senderEmails[0] ?? "sender"}`)
          }
          dateLabel={formatPreviewDisplayDate(viewingBriefing.generatedAt)}
          loadingMessage="Loading snapshot…"
        >
          <div className="max-w-full overflow-x-hidden rounded-lg border border-border/60 bg-muted/20">
            <iframe
              key={viewingBriefing.id}
              title="Snapshot preview"
              className="h-[65vh] max-h-[70vh] w-full max-w-full border-0 bg-slate-950"
              srcDoc={constrainBriefingPreviewHtml(viewingBriefing.htmlPreview)}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              onLoad={onIframeLoad}
            />
          </div>
        </PreviewLoadChrome>
      ) : null}
    </ActionDialogShell>
  );
}
