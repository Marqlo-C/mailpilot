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
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (score >= 60) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-muted/60 text-muted-foreground";
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
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40 text-xs font-bold uppercase text-muted-foreground shadow-sm"
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
      className="h-10 w-10 shrink-0 rounded-xl border border-border/70 bg-muted/40 object-contain p-1 shadow-sm"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Opportunity card with corner classification badge, full-width header,
 * liquid metadata pills, and split primary/safety action bar.
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

  const secondaryBtnClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#3c837b]/40 px-3 py-1.5 text-xs font-medium text-[#3c837b] transition-colors hover:border-[#3c837b] hover:bg-[#3c837b]/10 disabled:opacity-50";

  const safetyBtnClass =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

  const dismissBtnClass =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground/80 transition-colors hover:bg-muted hover:text-rose-500/90 disabled:opacity-50";

  const statusTag =
    variant === "history" ? (
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
          opportunity.isArchived && !dismissed
            ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-muted text-muted-foreground"
        )}
      >
        {opportunity.isArchived && !dismissed ? "Archived" : "Dismissed"}
      </span>
    ) : opportunity.status === "REVIEW_READY" ? (
      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Draft ready
      </span>
    ) : variant === "leads" && opportunity.isArchived && !userArchived ? (
      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Below threshold
      </span>
    ) : null;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200",
        belowThreshold &&
          opportunity.isArchived &&
          !userArchived &&
          "opacity-90",
        isSelected
          ? "border-[#3c837b]/70 bg-primary/[0.015] ring-2 ring-[#3c837b]/20"
          : "border-border/80 hover:border-border hover:shadow-md"
      )}
    >
      {/* Top-left: matching checkbox corner pill */}
      {onToggleSelect ? (
        <div className="absolute top-0 left-0 z-10 inline-flex h-[27px] select-none items-center justify-center rounded-br-xl border-b border-r border-border/70 bg-secondary/35 px-2.5 backdrop-blur-sm">
          <label className="m-0 flex cursor-pointer items-center p-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(opportunity.id)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30"
              aria-label={`Select ${opportunity.title}`}
            />
          </label>
        </div>
      ) : null}

      {/* Top-right: classification + match score corner pill */}
      <div className="absolute top-0 right-0 z-10 inline-flex h-[27px] select-none items-stretch overflow-hidden rounded-bl-xl border-b border-l border-border/70 bg-secondary/35 backdrop-blur-sm">
        <div
          className="inline-flex items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground"
          title={classifyLabel}
        >
          {isQuickApply ? (
            <Zap className="h-3 w-3 fill-amber-500/20 text-amber-500" />
          ) : isDirectEmail ? (
            <Mail className="h-3 w-3 text-muted-foreground/80" />
          ) : (
            <ExternalLink className="h-3 w-3 text-muted-foreground/80" />
          )}
          <span>{classifyLabel}</span>
        </div>
        <div className="my-1 w-px bg-border/70" />
        <div
          className={cn(
            "inline-flex items-center px-2.5 text-xs font-bold tracking-tight tabular-nums",
            scoreTone(score)
          )}
          title={opportunity.matchReason ?? undefined}
        >
          {score}%
        </div>
      </div>

      {/* Header: logo + role with clearance below corner pills */}
      <div className="flex items-start gap-3.5 px-4 pt-9 pb-3 sm:px-5">
        <CompanyLogo
          company={opportunity.company}
          logoUrl={opportunity.logoUrl}
          domain={opportunity.companyDomain}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {opportunity.company}
            </h4>
            {statusTag}
          </div>
          <h3 className="mt-0.5 truncate text-base font-semibold leading-snug text-foreground">
            {opportunity.title}
          </h3>
        </div>
      </div>

      {/* 3. Curved metadata capsules */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 select-none sm:px-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span className="max-w-[180px] truncate">
              {opportunity.location || "Remote / Unspecified"}
            </span>
          </div>
          {opportunity.salary ? (
            <>
              <span className="text-border">•</span>
              <div className="flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-3 w-3 shrink-0" />
                <span>{opportunity.salary}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs text-muted-foreground sm:ml-auto">
          {opportunity.postedAt ? (
            <>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span>Posted: {opportunity.postedAt}</span>
              </div>
              <span className="text-border">•</span>
            </>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span>Received: {receivedLabel}</span>
          </div>
        </div>
      </div>

      {/* 4. Content body */}
      <div className="flex flex-1 flex-col justify-start space-y-3 px-4 py-3.5 sm:px-5">
        {opportunity.description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {opportunity.description}
          </p>
        ) : null}

        {opportunity.matchReason ? (
          <div className="mt-auto flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/30 p-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 fill-[#3c837b]/15 text-[#3c837b]" />
            <p className="text-xs leading-relaxed text-foreground/85">
              {opportunity.matchReason}
            </p>
          </div>
        ) : null}
      </div>

      {/* 5. Pinned bottom action bar — primary left, safety right */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/[0.12] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {opportunity.applyUrl ? (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3c837b] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#337069]"
            >
              View Posting
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="inline-flex items-center rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground/60">
              No apply link detected
            </span>
          )}

          {variant === "leads" ? (
            canEmail ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onReviewDraft}
                  className={secondaryBtnClass}
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Review Draft</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onSendNow}
                  className={secondaryBtnClass}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send now</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onMarkApplied}
                className={secondaryBtnClass}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Mark Applied</span>
              </button>
            )
          ) : null}

          {variant === "action" && canEmail ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onReviewDraft}
                className={secondaryBtnClass}
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Review Draft</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onSendNow}
                className={secondaryBtnClass}
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send now</span>
              </button>
            </>
          ) : null}

          {variant === "applied" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onUnmarkApplied}
              className={secondaryBtnClass}
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Unmark Applied</span>
            </button>
          ) : null}

          {variant === "history" ? (
            <button
              type="button"
              disabled={busy}
              onClick={runRestore}
              className={secondaryBtnClass}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{restoreLabel}</span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {variant === "leads" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={runArchive}
                className={safetyBtnClass}
              >
                <Archive className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Archive</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runDismiss}
                className={dismissBtnClass}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Dismiss</span>
              </button>
            </>
          ) : null}

          {variant === "action" ? (
            <button
              type="button"
              disabled={busy}
              onClick={runDismiss}
              className={dismissBtnClass}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Dismiss</span>
            </button>
          ) : null}

          {variant === "applied" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={runArchive}
                className={safetyBtnClass}
              >
                <Archive className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Archive</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runDismiss}
                className={dismissBtnClass}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Dismiss</span>
              </button>
            </>
          ) : null}

          {variant === "history" ? (
            <>
              {opportunity.isArchived && !dismissed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={runDismiss}
                  title="Move to Dismissed so it can be deleted or auto-purged"
                  className={dismissBtnClass}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Dismiss</span>
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
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
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
