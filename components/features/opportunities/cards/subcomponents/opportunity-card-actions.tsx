"use client";

import {
  CheckCircle2,
  ExternalLink,
  Mail,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import type { OpportunityCardVariant } from "./opportunity-card-menu";

export type OpportunityCardActionsProps = {
  variant: OpportunityCardVariant;
  actionsLocked: boolean;
  canEmail?: boolean;
  validApplyUrl?: string | null;
  restoreLabel: string;
  primaryBtnClass: string;
  secondaryBtnClass: string;
  onMarkApplied?: () => void;
  onUnmarkApplied?: () => void;
  onReviewDraft?: () => void;
  onSendNow?: () => void;
  onRestore: () => void;
};

export function OpportunityCardActions({
  variant,
  actionsLocked,
  canEmail,
  validApplyUrl,
  restoreLabel,
  primaryBtnClass,
  secondaryBtnClass,
  onMarkApplied,
  onUnmarkApplied,
  onReviewDraft,
  onSendNow,
  onRestore,
}: OpportunityCardActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Secondary (left of primary) */}
      {variant === "leads" ? (
        <button
          type="button"
          disabled={actionsLocked}
          onClick={onMarkApplied}
          className={secondaryBtnClass}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Mark Applied</span>
        </button>
      ) : null}

      {variant === "action" && canEmail ? (
        <button
          type="button"
          disabled={actionsLocked}
          onClick={onReviewDraft}
          className={secondaryBtnClass}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>Review Draft</span>
        </button>
      ) : null}

      {variant === "history" && validApplyUrl ? (
        actionsLocked ? (
          <span className={secondaryBtnClass} aria-disabled>
            <span>View Posting</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        ) : (
          <a
            href={validApplyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryBtnClass}
          >
            <span>View Posting</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )
      ) : null}

      {/* Primary (just left of ⋮) */}
      {variant === "leads" ? (
        canEmail ? (
          <button
            type="button"
            disabled={actionsLocked}
            onClick={onReviewDraft}
            className={primaryBtnClass}
          >
            <Mail className="h-3.5 w-3.5" />
            <span>Draft Reply</span>
          </button>
        ) : validApplyUrl ? (
          actionsLocked ? (
            <span className={primaryBtnClass} aria-disabled>
              <span>View Posting</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          ) : (
            <a
              href={validApplyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryBtnClass}
            >
              <span>View Posting</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )
        ) : (
          <span className="inline-flex items-center rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground/60">
            No link detected
          </span>
        )
      ) : null}

      {variant === "applied" ? (
        <button
          type="button"
          disabled={actionsLocked}
          onClick={onUnmarkApplied}
          className={primaryBtnClass}
        >
          <Undo2 className="h-3.5 w-3.5" />
          <span>Mark Unapplied</span>
        </button>
      ) : null}

      {variant === "action" ? (
        canEmail ? (
          <button
            type="button"
            disabled={actionsLocked}
            onClick={onSendNow}
            className={primaryBtnClass}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        ) : validApplyUrl ? (
          actionsLocked ? (
            <span className={primaryBtnClass} aria-disabled>
              <span>View Posting</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          ) : (
            <a
              href={validApplyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryBtnClass}
            >
              <span>View Posting</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )
        ) : null
      ) : null}

      {variant === "history" ? (
        <button
          type="button"
          disabled={actionsLocked}
          onClick={onRestore}
          className={primaryBtnClass}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{restoreLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
