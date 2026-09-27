"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import {
  Archive,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Mail,
  MapPin,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  XCircle,
  Zap,
} from "lucide-react";

import {
  archiveOpportunities,
  deleteDismissedPermanently,
  dismissOpportunities,
  restoreOpportunities,
} from "@/app/actions/opportunities";
import { getCompanyLogoUrl } from "@/lib/company-logo";
import { canDraftDirectEmail } from "@/lib/application-method";
import { formatDistanceToNow } from "@/lib/format-distance";
import {
  daysRemainingUntilPurge,
  isUserArchived,
} from "@/lib/opportunities/lifecycle";
import { cn } from "@/lib/utils";

export type OpportunityCardVariant =
  | "leads"
  | "applied"
  | "action"
  | "history";

type OpportunityCardProps = {
  opportunity: JobOpportunity;
  matchThreshold: number;
  variant?: OpportunityCardVariant;
  pending?: boolean;
  retentionDays?: number;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onReviewDraft?: () => void;
  onSendNow?: () => void;
  onMarkApplied?: () => void;
  onUnmarkApplied?: () => void;
  onArchive?: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
};

function scoreTone(score: number): string {
  if (score >= 80) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (score >= 60) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "border-border bg-muted text-muted-foreground";
}

function CompanyLogo({
  company,
  logoUrl,
  domain,
}: {
  company: string;
  logoUrl: string | null;
  domain: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl || getCompanyLogoUrl(company, domain);
  const initial = company.trim().slice(0, 2).toUpperCase() || "?";

  if (failed) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-sm font-bold uppercase text-muted-foreground"
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-lg border border-border/60 bg-muted/40 object-contain p-1"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Segmented 4-tier opportunity card: header, metadata bar, AI body, action footer.
 */
export function OpportunityCard({
  opportunity,
  matchThreshold,
  variant = "leads",
  pending = false,
  retentionDays = 30,
  isSelected = false,
  onToggleSelect,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onUnmarkApplied,
  onArchive,
  onDismiss,
  onRestore,
  onDelete,
}: OpportunityCardProps) {
  const router = useRouter();
  const [actionPending, startTransition] = useTransition();
  const busy = pending || actionPending;

  const canEmail = canDraftDirectEmail(opportunity.recipientEmail);
  const score = opportunity.matchScore ?? 0;
  const belowThreshold = score < matchThreshold;
  const dismissed = opportunity.status === "DISMISSED";
  const userArchived = isUserArchived(opportunity);
  const isQuickApply = opportunity.applicationType === "QUICK_APPLY";
  const isDirectEmail = opportunity.applicationType === "DIRECT_EMAIL";
  const daysLeft = daysRemainingUntilPurge(
    opportunity.dismissedAt,
    retentionDays
  );
  const receivedLabel = formatDistanceToNow(new Date(opportunity.receivedAt), {
    addSuffix: true,
  });

  function runArchive() {
    if (onArchive) {
      onArchive();
      return;
    }
    startTransition(async () => {
      await archiveOpportunities([opportunity.id]);
      router.refresh();
    });
  }

  function runDismiss() {
    if (onDismiss) {
      onDismiss();
      return;
    }
    startTransition(async () => {
      await dismissOpportunities([opportunity.id]);
      router.refresh();
    });
  }

  function runRestore() {
    if (onRestore) {
      onRestore();
      return;
    }
    startTransition(async () => {
      await restoreOpportunities([opportunity.id]);
      router.refresh();
    });
  }

  function runDelete() {
    if (onDelete) {
      onDelete();
      return;
    }
    startTransition(async () => {
      await deleteDismissedPermanently([opportunity.id]);
      router.refresh();
    });
  }

  const restoreLabel =
    opportunity.previousStatus === "APPLIED"
      ? "Restore to Applied"
      : "Restore to Active";

  const classifyLabel = isDirectEmail
    ? "Email Lead"
    : isQuickApply
      ? "Easy Apply"
      : "External";

  return (
    <article
      className={cn(
        "group relative rounded-xl border bg-card shadow-sm transition-all",
        belowThreshold &&
          opportunity.isArchived &&
          !userArchived &&
          "opacity-90",
        isSelected
          ? "border-primary bg-primary/[0.02] ring-1 ring-primary/30"
          : "border-border hover:border-border/80"
      )}
    >
      {/* 1. Header */}
      <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          {onToggleSelect ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(opportunity.id)}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-primary"
              aria-label={`Select ${opportunity.title}`}
            />
          ) : null}

          <CompanyLogo
            company={opportunity.company}
            logoUrl={opportunity.logoUrl}
            domain={opportunity.companyDomain}
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {opportunity.company}
              </h4>
              {variant === "history" ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                    opportunity.isArchived && !dismissed
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  )}
                >
                  {opportunity.isArchived && !dismissed
                    ? "Archived"
                    : "Dismissed"}
                </span>
              ) : null}
              {opportunity.status === "REVIEW_READY" ? (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Draft ready
                </span>
              ) : null}
              {variant === "leads" &&
              opportunity.isArchived &&
              !userArchived ? (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Below threshold
                </span>
              ) : null}
            </div>
            <h3 className="mt-0.5 truncate text-base font-semibold leading-snug text-foreground">
              {opportunity.title}
            </h3>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            title={classifyLabel}
            className="inline-flex select-none items-center gap-1 rounded-md border border-border/80 bg-secondary/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {isQuickApply ? (
              <Zap className="h-3 w-3 fill-amber-500/20 text-amber-500" />
            ) : isDirectEmail ? (
              <Mail className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">{classifyLabel}</span>
          </span>

          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
              scoreTone(score)
            )}
            title={opportunity.matchReason ?? undefined}
          >
            {score}%
          </span>
        </div>
      </div>

      {/* 2. Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-y border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        {opportunity.location ? (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
            <span className="max-w-[200px] truncate">{opportunity.location}</span>
          </div>
        ) : null}

        {opportunity.salary ? (
          <div className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <DollarSign className="h-3.5 w-3.5 shrink-0" />
            <span>{opportunity.salary}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-3 sm:ml-auto">
          {opportunity.postedAt ? (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              <span>Posted: {opportunity.postedAt}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
            <span>Received: {receivedLabel}</span>
          </div>
        </div>
      </div>

      {/* 3. Content + AI analysis */}
      <div className="space-y-3.5 p-4 text-sm sm:p-5">
        {opportunity.description ? (
          <p className="line-clamp-3 leading-relaxed text-muted-foreground">
            {opportunity.description}
          </p>
        ) : null}

        {opportunity.matchReason ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/10 bg-primary/[0.03] p-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 fill-primary/10 text-primary" />
            <p className="text-xs leading-relaxed text-foreground/90">
              {opportunity.matchReason}
            </p>
          </div>
        ) : null}
      </div>

      {/* 4. Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-border/60 bg-muted/10 px-4 py-3 sm:px-5">
        <div>
          {opportunity.applyUrl ? (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-sm transition-colors hover:bg-foreground/90"
            >
              View Posting
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span
              className="inline-flex items-center rounded-lg border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground"
              title="Apply link not detected; run Force Rescan to re-parse."
            >
              No apply link detected
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {variant === "leads" ? (
            <>
              {canEmail ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onReviewDraft}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Review Draft
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onSendNow}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send now
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onMarkApplied}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Mark Applied
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={runArchive}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runDismiss}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </>
          ) : null}

          {variant === "action" ? (
            <>
              {canEmail ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onReviewDraft}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Review Draft
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onSendNow}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send now
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={runDismiss}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </>
          ) : null}

          {variant === "applied" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onUnmarkApplied}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Unmark Applied
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runArchive}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runDismiss}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </>
          ) : null}

          {variant === "history" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={runRestore}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restoreLabel}
              </button>

              {opportunity.isArchived && !dismissed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={runDismiss}
                  title="Move to Dismissed so it can be deleted or auto-purged"
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              ) : null}

              {dismissed ? (
                <>
                  <span className="inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {daysLeft}d left
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={runDelete}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
