"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@/lib/generated/prisma/client";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Mail,
  Sparkle,
  Sparkles,
  Zap,
} from "lucide-react";

import {
  deleteDismissedPermanently,
  reprocessOpportunityEmailAction,
} from "@/app/actions/opportunities";
import { toast } from "sonner";
import { formatToastError } from "@/lib/utils/ui/toast-format";
import { LabelTooltip } from "@/components/ui/tooltip";
import { WavyDashedFrame } from "@/components/ui/tactile/wavy-dashed-frame";
import { WavyDashedLine } from "@/components/ui/tactile/wavy-dashed-line";
import {
  variantToJobsTabKey,
  type JobCardAction,
} from "@/lib/opportunities/movement-rules";
import { runJobCardAction } from "@/lib/opportunities/run-job-move";
import { OpportunityCardBadges } from "./subcomponents/opportunity-card-badges";
import { OpportunityCardActions } from "./subcomponents/opportunity-card-actions";
import { OpportunityCardDescription } from "./subcomponents/opportunity-card-description";
import { OpportunityCardMenu } from "./subcomponents/opportunity-card-menu";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { Checkbox } from "@/components/ui/checkbox";
import { MetaChip } from "@/components/ui/tactile/meta-chip";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  PRIMARY_ACTION_BTN_CLASSNAME,
  PRIMARY_ACTION_BTN_MUTED_CLASSNAME,
} from "@/components/ui/styles/primary-action-btn";
import { selectCheckboxClassName } from "@/components/ui/styles/select-checkbox";
import {
  SELECT_HIGHLIGHT_CLASSNAME,
  SELECT_HIGHLIGHT_FILL_CLASSNAME,
} from "@/components/ui/styles/select-highlight";
import {
  SECONDARY_ACTION_BTN_CLASSNAME,
  SECONDARY_ACTION_BTN_MUTED_CLASSNAME,
} from "@/components/ui/styles/secondary-action-btn";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { isKnownJobDomain } from "@/lib/constants/job-sources";
import { canDraftDirectEmail } from "@/lib/opportunities/application-method";
import {
  daysRemainingUntilPurge,
  isUserArchived,
} from "@/lib/opportunities/lifecycle";
import {
  extractSalaryFromText,
  normalizeSalaryDisplay,
} from "@/lib/ai/classifier";
import { formatOpportunityModalBody } from "@/lib/opportunities/context/card-description";
import { formatRelativeTime } from "@/lib/utils/format-distance";
import { cn } from "@/lib/utils";

export type OpportunityCardVariant =
  | "leads"
  | "applied"
  | "action"
  | "history";

export type OpportunityCardProps = {
  opportunity: JobOpportunity;
  matchThreshold: number;
  variant?: OpportunityCardVariant;
  pending?: boolean;
  retentionDays?: number;
  isSelected?: boolean;
  /** Most recently toggled checkbox in the shared selection set. */
  isLastClicked?: boolean;
  /** Whether the user is actively in multi-select mode. */
  isMultiSelect?: boolean;
  /** Whether embedded vector AI scoring is active. */
  isEmbeddedAiEnabled?: boolean;
  /** Whether autonomous email dispatch is active. */
  isAutoDispatchEnabled?: boolean;
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
  onViewOriginalEmail?: () => void;
  /** Pointer / data attrs from `useCardListGestures().bindItem`. */
  itemProps?: {
    "data-dnd-item-id": string;
    onPointerDown: (event: ReactPointerEvent) => void;
    style?: CSSProperties;
  };
  /** Insert marker above this card while reordering. */
  showInsertBefore?: boolean;
};

function scoreTone(score: number): string {
  if (score >= 80) {
    return "bg-[hsl(174_22%_92%)] text-[#147a76] dark:bg-[hsl(174_28%_22%/0.55)] dark:text-[#5eead4]";
  }
  if (score >= 60) {
    return "bg-[hsl(28_70%_48%/0.14)] text-[hsl(28_62%_36%)] dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)]";
  }
  return "bg-muted/60 text-muted-foreground";
}

function scoreIconColor(score: number, isApplied?: boolean): string {
  if (isApplied) {
    return "text-muted-foreground";
  }
  if (score >= 80) {
    return "text-[#147a76] dark:text-[#5eead4]";
  }
  if (score >= 60) {
    return "text-[hsl(28_62%_36%)] dark:text-[hsl(28_75%_68%)]";
  }
  return "text-muted-foreground";
}

/**
 * Opportunity card with corner classification badge, full-width header,
 * liquid metadata pills, and secondary · primary · ⋮ action bar.
 */
export function OpportunityCard({
  opportunity,
  matchThreshold,
  variant = "leads",
  pending = false,
  retentionDays = 30,
  isSelected = false,
  isLastClicked = false,
  isMultiSelect = false,
  isEmbeddedAiEnabled,
  isAutoDispatchEnabled: _isAutoDispatchEnabled,
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
  onViewOriginalEmail,
  itemProps,
  showInsertBefore = false,
}: OpportunityCardProps) {
  const { style: itemStyle, ...itemRest } = itemProps ?? {};
  const router = useRouter();
  const [actionPending, startTransition] = useTransition();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  const busy = pending || actionPending;
  const actionsLocked = busy || isSelected;

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
  const salaryRaw = opportunity.salary?.trim() ?? "";
  const locationRaw = opportunity.location?.trim() ?? "";
  const descriptionContext = {
    roleTitle: opportunity.title,
    company: opportunity.company,
    location: locationRaw || null,
    salary: salaryRaw || null,
  };
  const modalDescription = formatOpportunityModalBody(
    opportunity.description,
    descriptionContext
  );
  const hasDescription = Boolean(modalDescription);
  const normalizedSalary =
    normalizeSalaryDisplay(salaryRaw) ??
    (modalDescription ? extractSalaryFromText(modalDescription) : null);
  const salaryLabel = normalizedSalary || "$TBD";
  const locationLabel = locationRaw || "Remote / Unspecified";
  const postedRaw =
    formatRelativeTime(opportunity.postedAt, { addSuffix: false }) ?? "";

  function runLifecycleAction(action: JobCardAction) {
    startTransition(async () => {
      const result = await runJobCardAction(
        variantToJobsTabKey(variant),
        action,
        [opportunity.id]
      );
      if (!result.ok) return;
      router.refresh();
    });
  }

  function runArchive() {
    if (onArchive) {
      onArchive();
      return;
    }
    runLifecycleAction("archive");
  }

  function runDismiss() {
    if (onDismiss) {
      onDismiss();
      return;
    }
    runLifecycleAction("dismiss");
  }

  function runRestore() {
    if (onRestore) {
      onRestore();
      return;
    }
    runLifecycleAction("restore");
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
      ? "Put Back to Applied"
      : "Put Back to Leads";

  const isDev = process.env.NODE_ENV === "development";
  const [isReprocessing, setIsReprocessing] = useState(false);

  const handleReprocess = async () => {
    if (isReprocessing) return;
    setIsReprocessing(true);
    const toastId = toast.loading("Re-processing email…");
    try {
      const res = await reprocessOpportunityEmailAction(opportunity.id);
      if (res.ok) {
        toast.success("Email re-synced", { id: toastId });
        router.refresh();
      } else {
        toast.error(formatToastError(res.error, "Re-sync failed"), {
          id: toastId,
        });
      }
    } catch (err) {
      toast.error(formatToastError(err, "Re-sync failed"), { id: toastId });
    } finally {
      setIsReprocessing(false);
    }
  };

  const classifyLabel = isDirectEmail
    ? "Email Lead"
    : isQuickApply
      ? "Easy Apply"
      : "External";

  const primaryBtnClass = isSelected
    ? PRIMARY_ACTION_BTN_MUTED_CLASSNAME
    : PRIMARY_ACTION_BTN_CLASSNAME;
  const secondaryBtnClass = isSelected
    ? SECONDARY_ACTION_BTN_MUTED_CLASSNAME
    : SECONDARY_ACTION_BTN_CLASSNAME;

  const showOverflowMenu =
    variant === "leads" || variant === "applied" || variant === "action";

  const statusPillClass =
    "inline-flex h-[14px] shrink-0 items-center rounded-full border px-1.5 text-[9px] font-semibold leading-none";

  const statusTag =
    variant === "history" ? (
      <span
        className={cn(
          statusPillClass,
          "font-bold uppercase",
          opportunity.isArchived && !dismissed
            ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-muted text-muted-foreground"
        )}
      >
        {opportunity.isArchived && !dismissed ? "Archived" : "Dismissed"}
      </span>
    ) : opportunity.status === "REVIEW_READY" ? (
      <span
        className={cn(
          statusPillClass,
          "border-border bg-muted text-muted-foreground"
        )}
      >
        Draft ready
      </span>
    ) : variant === "leads" && belowThreshold && !userArchived ? (
      <span
        className={cn(
          statusPillClass,
          "border-border bg-muted text-muted-foreground"
        )}
      >
        Below threshold
      </span>
    ) : null;

  const isLongReason = Boolean(
    opportunity.matchReason && opportunity.matchReason.length > 80
  );

  const sparklesGradId = `sparkles-grad-${opportunity.id}`;
  const scoreColorHex = isApplied
    ? "#94a3b8"
    : score >= 80
      ? "#1ab5af"
      : score >= 60
        ? "#f59e0b"
        : "#94a3b8";

  const validApplyUrl =
    opportunity.applyUrl && /^https?:\/\//i.test(opportunity.applyUrl.trim())
      ? opportunity.applyUrl.trim()
      : null;

  const hasRichDescription = useMemo(() => {
    const desc = opportunity.description?.trim() || "";
    if (desc.length >= 300) return true;
    return /(?:requirements|qualifications|must\s+have|what\s+you(?:'ll|\s+will)\s+bring|what\s+we(?:'re|\s+are)\s+looking\s+for|preferred\s+skills|minimum\s+qualifications)/i.test(
      desc
    );
  }, [opportunity.description]);

  const isAggregator = (val?: string | null): boolean => {
    if (!val) return false;
    const lower = val.toLowerCase();
    return lower.includes("jobleads") || isKnownJobDomain(lower);
  };

  const rawLogo =
    opportunity.logoUrl && !isAggregator(opportunity.logoUrl)
      ? opportunity.logoUrl
      : null;

  const safeDomain =
    opportunity.companyDomain && !isAggregator(opportunity.companyDomain)
      ? opportunity.companyDomain
      : null;

  const companyLogoSrc =
    rawLogo ||
    getCompanyLogoUrl(
      opportunity.company,
      safeDomain,
      opportunity.applyUrl
    );

  return (
    <article
      data-opportunity-card=""
      {...itemRest}
      style={itemStyle}
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card transition-all duration-200 select-none active:scale-[0.99]",
        belowThreshold && !userArchived && "opacity-90",
        isSelected
          ? cn(SELECT_HIGHLIGHT_CLASSNAME, SELECT_HIGHLIGHT_FILL_CLASSNAME)
          : "border border-border/80 shadow-md hover:border-border hover:shadow-xl shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.06)]"
      )}
    >
      {showInsertBefore ? (
        <div
          className="pointer-events-none absolute inset-x-3 top-0 z-20 h-0.5 bg-[#1ab5af]"
          aria-hidden
        />
      ) : null}

      {/* Header: logo + company & role title (flexed left) and Score MetaChip + Channel icon (in-flow right) */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CompanyLogo
            src={companyLogoSrc}
            name={opportunity.company}
            size="jobCard"
          />
          <div
            className={cn(
              "min-w-0 flex-1",
              isSelected && "text-muted-foreground"
            )}
          >
            <h3
              className={cn(
                "truncate text-base font-semibold leading-snug",
                isSelected ? "text-muted-foreground" : "text-foreground"
              )}
              title={opportunity.title}
            >
              {opportunity.title}
            </h3>
            <div className="mt-1 flex h-4 items-center gap-1.5">
              <h4
                className={cn(
                  "truncate text-xs font-medium capitalize leading-none",
                  isSelected ? "text-muted-foreground" : "text-foreground/80"
                )}
              >
                {opportunity.company}
              </h4>
              {statusTag}
            </div>
          </div>
        </div>

        {/* Top-right utility cluster: Score MetaChip + Channel icon */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 select-none pt-0.5",
            isSelected && "opacity-55"
          )}
        >
          {isApplied ? (
            <MetaChip
              title={appliedDate ? new Date(appliedDate).toLocaleString() : "Applied"}
              value={`Applied ${appliedLabel}`}
              valueClassName="text-muted-foreground font-medium"
              selected={isSelected}
            />
          ) : (
            <MetaChip
              title={opportunity.matchReason ?? undefined}
              value={
                <>
                  <NumberTicker value={score} />%
                </>
              }
              valueClassName={
                isSelected
                  ? "bg-muted/50 text-muted-foreground"
                  : cn(scoreTone(score), "font-bold")
              }
              selected={isSelected}
            />
          )}

          <LabelTooltip label={classifyLabel} side="top">
            <div className="inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-md border border-border/40 bg-card shadow-xs transition-colors">
              {isQuickApply ? (
                <Zap
                  className={cn(
                    "h-3.5 w-3.5 fill-current/20 transition-colors",
                    isSelected
                      ? "text-muted-foreground"
                      : scoreIconColor(score, isApplied)
                  )}
                />
              ) : isDirectEmail ? (
                <Mail
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isSelected
                      ? "text-muted-foreground"
                      : scoreIconColor(score, isApplied)
                  )}
                />
              ) : (
                <ArrowUpRight
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isSelected
                      ? "text-muted-foreground"
                      : scoreIconColor(score, isApplied)
                  )}
                />
              )}
            </div>
          </LabelTooltip>
        </div>
      </div>

      <OpportunityCardBadges
        locationRaw={locationRaw}
        locationLabel={locationLabel}
        salaryRaw={salaryRaw}
        salaryLabel={salaryLabel}
        postedRaw={postedRaw}
        receivedAt={opportunity.receivedAt}
        isSelected={isSelected}
      />

      {/* 4. Content body — description aligns with first metadata pill; AI row keeps tighter inset */}
      <div
        className={cn(
          "flex flex-1 flex-col justify-start pt-2.5 pb-3",
          isSelected && "opacity-55"
        )}
      >
        <OpportunityCardDescription
          title={opportunity.title}
          company={opportunity.company}
          location={locationRaw || null}
          salary={normalizedSalary || salaryRaw || null}
          description={opportunity.description}
          logoSrc={companyLogoSrc}
          applyUrl={validApplyUrl}
          open={descriptionOpen}
          onOpenChange={setDescriptionOpen}
          isMultiSelect={isMultiSelect}
        />

        {opportunity.matchReason ? (
          <div className="mt-auto flex items-start gap-2 px-2.5 pt-3 sm:px-3">
            <WavyDashedFrame
              data-match-reason-box=""
              className="w-full min-h-[4.875rem] rounded-lg bg-muted/20 px-2.5 py-2.5 sm:px-3 dark:bg-muted/10"
            >
              <div className="flex items-center justify-between gap-1.5 pb-1.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  {hasRichDescription ? (
                    <span title="Full spec heuristic evaluation" className="inline-flex items-center">
                      <svg className="absolute h-0 w-0 overflow-hidden" aria-hidden="true" focusable="false">
                        <defs>
                          <linearGradient id={sparklesGradId} x1="90%" y1="10%" x2="10%" y2="90%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor={scoreColorHex} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <Sparkles
                        aria-label="Full spec heuristic evaluation"
                        className="size-3.5 shrink-0"
                        stroke={`url(#${sparklesGradId})`}
                      />
                    </span>
                  ) : (
                    <span title="Slim title & leveling evaluation" className="inline-flex items-center">
                      <Sparkle
                        aria-label="Slim title & leveling evaluation"
                        className="size-3.5 text-muted-foreground/80 shrink-0"
                      />
                    </span>
                  )}
                  <span className="font-brand text-xs font-semibold tracking-tight text-muted-foreground/90 dark:text-foreground/90">
                    Why it fits...
                  </span>
                </div>
                {isLongReason ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setRationaleExpanded((prev) => !prev);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    className="relative inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring before:absolute before:-inset-2 before:content-['']"
                    aria-label={rationaleExpanded ? "Collapse insight" : "Expand insight"}
                    aria-expanded={rationaleExpanded}
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform duration-200 ease-out",
                        rationaleExpanded && "rotate-180"
                      )}
                    />
                  </button>
                ) : null}
              </div>
              <p
                className={cn(
                  "text-[11px] leading-relaxed text-foreground/75 dark:text-foreground/80 transition-all duration-200",
                  !rationaleExpanded && "line-clamp-2"
                )}
              >
                {opportunity.matchReason}
              </p>
            </WavyDashedFrame>
          </div>
        ) : null}
      </div>

      {/* 5. Pinned bottom action bar — secondary · primary · ⋮ */}
      {/* pr matches action gap-2 so ⋮ sits evenly vs left button and card edge */}
      <div className="mt-auto flex flex-col">
        <WavyDashedLine orientation="horizontal" cutoffFill />
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/90 px-4 py-3 sm:px-4 sm:py-3.5">
            <div className="flex min-w-0 items-center gap-2">
              {onToggleSelect ? (
                <label
                  className="relative m-0 inline-flex cursor-pointer items-center justify-center p-0 touch-manipulation before:absolute before:-inset-3 before:content-['']"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggleSelect(opportunity.id)}
                    className={isLastClicked ? "mp-select-checkbox-last-clicked" : undefined}
                    aria-label={`Select ${opportunity.title}`}
                  />
                </label>
              ) : null}

              {variant === "history" && dismissed ? (
                <span className="inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {daysLeft}d left
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              <OpportunityCardActions
                variant={variant}
                actionsLocked={actionsLocked}
                canEmail={canEmail}
                validApplyUrl={validApplyUrl}
                restoreLabel={restoreLabel}
                primaryBtnClass={primaryBtnClass}
                secondaryBtnClass={secondaryBtnClass}
                onMarkApplied={onMarkApplied}
                onUnmarkApplied={onUnmarkApplied}
                onReviewDraft={onReviewDraft}
                onSendNow={onSendNow}
                onRestore={runRestore}
              />

              {showOverflowMenu ? (
                <OpportunityCardMenu
                  variant={variant}
                  actionsLocked={actionsLocked}
                  isSelected={isSelected}
                  hasDescription={hasDescription}
                  canEmail={canEmail}
                  opportunity={opportunity}
                  validApplyUrl={validApplyUrl}
                  dismissed={dismissed}
                  isDev={isDev}
                  isReprocessing={isReprocessing}
                  onDescriptionOpen={() => setDescriptionOpen(true)}
                  onReviewDraft={onReviewDraft}
                  onSendNow={onSendNow}
                  onViewOriginalEmail={onViewOriginalEmail}
                  onArchive={runArchive}
                  onDismiss={runDismiss}
                  onLessLikeThis={onLessLikeThis}
                  onDelete={runDelete}
                  onReprocess={handleReprocess}
                />
              ) : null}
            </div>
        </div>
      </div>
    </article>
  );
}
