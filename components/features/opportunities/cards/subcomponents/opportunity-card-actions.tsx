"use client";

import {
  CheckCircle2,
  ExternalLink,
  Mail,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import { ACTION_CTA_CLUSTER_GAP_CLASSNAME } from "@/components/ui/styles/action-button-styles";
import type { OpportunityCardVariant } from "./opportunity-card-menu";
import { cn } from "@/lib/utils";

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

/**
 * Touch target ergonomics:
 * Maintains dense, crisp UI footprint across both mouse and touch devices.
 * 44px touch target is achieved via an invisible pseudo-element expansion.
 */
const TOUCH_TARGET_ACTION_CLASSNAME =
  "relative touch-manipulation before:absolute before:inset-0 before:top-1/2 before:min-h-[44px] before:w-full before:min-w-full before:-translate-y-1/2 before:content-['']";

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
  const primaryClass = cn(primaryBtnClass, TOUCH_TARGET_ACTION_CLASSNAME);
  const secondaryClass = cn(secondaryBtnClass, TOUCH_TARGET_ACTION_CLASSNAME);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end",
        ACTION_CTA_CLUSTER_GAP_CLASSNAME
      )}
    >
      {/* Secondary (left of primary) */}
      {variant === "leads" ? (
        <button
          type="button"
          disabled={actionsLocked}
          onClick={onMarkApplied}
          className={secondaryClass}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Mark as Applied</span>
        </button>
      ) : null}

      {variant === "action" && canEmail ? (
        <button
          type="button"
          disabled={actionsLocked}
          onClick={onReviewDraft}
          className={secondaryClass}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>Edit Draft</span>
        </button>
      ) : null}

      {variant === "history" && validApplyUrl ? (
        actionsLocked ? (
          <span className={secondaryClass} aria-disabled>
            <span>Open Link</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        ) : (
          <a
            href={validApplyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryClass}
          >
            <span>Open Link</span>
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
            className={primaryClass}
          >
            <Mail className="h-3.5 w-3.5" />
            <span>Reply</span>
          </button>
        ) : validApplyUrl ? (
          actionsLocked ? (
            <span className={primaryClass} aria-disabled>
              <span>Apply</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          ) : (
            <a
              href={validApplyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryClass}
            >
              <span>Apply</span>
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
          className={primaryClass}
        >
          <Undo2 className="h-3.5 w-3.5" />
          <span>Move to Leads</span>
        </button>
      ) : null}

      {variant === "action" ? (
        canEmail ? (
          <button
            type="button"
            disabled={actionsLocked}
            onClick={onSendNow}
            className={primaryClass}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        ) : validApplyUrl ? (
          actionsLocked ? (
            <span className={primaryClass} aria-disabled>
              <span>Apply</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          ) : (
            <a
              href={validApplyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryClass}
            >
              <span>Apply</span>
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
          className={primaryClass}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{restoreLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
