"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import {
  Archive,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  MoreHorizontal,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onLessLikeThis?: () => void;
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
  onLessLikeThis,
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
  const isApplied =
    opportunity.status === "APPLIED" || Boolean(opportunity.appliedAt);
  const appliedDate = opportunity.appliedAt ?? opportunity.receivedAt;
  const appliedLabel = appliedDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date(appliedDate))
    : "Recently";
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
  const salaryRaw = opportunity.salary?.trim() ?? "";
  const salaryLabel =
    !salaryRaw || /^\$?\s*tbd\b/i.test(salaryRaw) ? "$TBD" : salaryRaw;
  const locationRaw = opportunity.location?.trim() ?? "";
  const locationLabel = locationRaw || "Remote / Unspecified";
  const postedRaw = opportunity.postedAt?.trim() ?? "";

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

  const showOverflowMenu =
    variant === "leads" || variant === "applied" || variant === "action";

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
    ) : variant === "leads" && belowThreshold && !userArchived ? (
      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Below threshold
      </span>
    ) : null;

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200",
        belowThreshold && !userArchived && "opacity-90",
        isSelected
          ? "border-[#3c837b]/70 bg-primary/[0.015] ring-2 ring-[#3c837b]/20"
          : "border-border/80 hover:border-border hover:shadow-md"
      )}
    >
      {/* Top-left: checkbox pill — px-3 matches ToolbarRoot Select All padding */}
      {onToggleSelect ? (
        <div className="absolute top-0 left-0 z-10 inline-flex h-[27px] select-none items-center justify-center rounded-br-xl border-b border-r border-border/70 bg-secondary/35 px-3 backdrop-blur-sm">
          <label className="m-0 flex cursor-pointer items-center p-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(opportunity.id)}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30"
              aria-label={`Select ${opportunity.title}`}
            />
          </label>
        </div>
      ) : null}

      {/* Top-right: classification + match score / applied date corner pill */}
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
        {isApplied ? (
          <div
            className="inline-flex items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground"
            title={
              appliedDate
                ? new Date(appliedDate).toLocaleString()
                : "Applied"
            }
          >
            Applied {appliedLabel}
          </div>
        ) : (
          <div
            className={cn(
              "inline-flex items-center px-2.5 text-xs font-bold tracking-tight tabular-nums",
              scoreTone(score)
            )}
            title={opportunity.matchReason ?? undefined}
          >
            {score}%
          </div>
        )}
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

      {/* Metadata — left: location + salary badges; right: unboxed telemetry */}
      <div className="flex w-full min-w-0 items-center justify-between gap-2 px-4 py-1 text-xs select-none sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/40 bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground/80"
            title={`Location: ${locationRaw || "Not specified"}`}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span className="max-w-[200px] truncate">{locationLabel}</span>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
              salaryRaw && !/^\$?\s*tbd\b/i.test(salaryRaw)
                ? "border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-border/30 bg-muted/40 text-muted-foreground"
            )}
            title={`Salary: ${salaryRaw || "Not specified"}`}
          >
            <Banknote className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span>{salaryLabel}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-muted-foreground">
          {postedRaw ? (
            <>
              <span
                className="inline-flex items-center gap-1.5"
                title={`Posted: ${postedRaw}`}
              >
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span>{postedRaw}</span>
              </span>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
            </>
          ) : null}
          <span
            className="inline-flex items-center gap-1.5"
            title={`Received: ${receivedLabel}`}
          >
            <Send className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span>{receivedLabel}</span>
          </span>
        </div>
      </div>

      {/* 4. Content body */}
      <div className="flex flex-1 flex-col justify-start space-y-3 px-4 py-3.5 sm:px-5">
        {opportunity.description ? (
          <p className="min-h-[2.5rem] line-clamp-2 text-xs leading-relaxed text-foreground/80 dark:text-foreground/85">
            {opportunity.description}
          </p>
        ) : null}

        {opportunity.matchReason ? (
          <div className="mt-auto flex items-start gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-2.5 dark:bg-muted/10">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {opportunity.matchReason}
            </p>
          </div>
        ) : null}
      </div>

      {/* 5. Pinned bottom action bar — primary left, overflow menu right */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/[0.12] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {opportunity.applyUrl ? (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
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
          {variant === "history" && dismissed ? (
            <span className="inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {daysLeft}d left
            </span>
          ) : null}

          {showOverflowMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(variant === "leads" || variant === "applied") && (
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={runArchive}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={busy} onClick={runDismiss}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Dismiss
                </DropdownMenuItem>
                {onLessLikeThis ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={busy}
                      onClick={onLessLikeThis}
                      className="text-amber-600 focus:bg-amber-50 focus:text-amber-600 dark:text-amber-400 dark:focus:bg-amber-950/50 dark:focus:text-amber-400"
                    >
                      <ThumbsDown className="mr-2 h-4 w-4" />
                      Less like this
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {variant === "history" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {opportunity.isArchived && !dismissed ? (
                  <DropdownMenuItem disabled={busy} onClick={runDismiss}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Dismiss
                  </DropdownMenuItem>
                ) : null}
                {dismissed ? (
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={runDelete}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </article>
  );
}
