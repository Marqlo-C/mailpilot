"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import {
  Clock,
  ExternalLink,
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
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/styles/score-percent";
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
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (score >= 60) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-muted/60 text-muted-foreground";
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
      ? "Restore to Applied"
      : "Restore to Active";

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

  const isVectorClassification = Boolean(
    opportunity.matchReason &&
    /semantic vector|vector crossover|transferable competencies/i.test(
      opportunity.matchReason
    )
  );
  const showVectorBadge =
    process.env.NODE_ENV === "development" &&
    isEmbeddedAiEnabled !== false &&
    isVectorClassification;
  const vectorBadge = showVectorBadge ? (
    <span
      className={cn(
        statusPillClass,
        "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium"
      )}
      title="Evaluated via Embedded Vector AI (Dev-only indicator)"
    >
      Vector AI
    </span>
  ) : null;

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
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card transition-all duration-200 select-none",
        belowThreshold && !userArchived && "opacity-90",
        isSelected
          ? cn(SELECT_HIGHLIGHT_CLASSNAME, SELECT_HIGHLIGHT_FILL_CLASSNAME)
          : "border border-border/80 shadow-lg hover:border-border hover:shadow-xl"
      )}
    >
      {showInsertBefore ? (
        <div
          className="pointer-events-none absolute inset-x-3 top-0 z-20 h-0.5 bg-[#1ab5af]"
          aria-hidden
        />
      ) : null}
      {/* Top-left: bare select checkbox */}
      {onToggleSelect ? (
        <label className="absolute top-2.5 left-3 z-10 m-0 flex cursor-pointer items-center p-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(opportunity.id)}
            className={selectCheckboxClassName({
              lastClicked: isLastClicked,
              className: "h-3.5 w-3.5 shrink-0 cursor-pointer",
            })}
            aria-label={`Select ${opportunity.title}`}
          />
        </label>
      ) : null}

      {/* Top-right: classification + match score / applied date corner pill */}
      <div
        className={cn(
          "absolute top-0 right-0 z-10 inline-flex h-[27px] select-none items-stretch overflow-hidden rounded-bl-xl border-b border-l border-border/70 bg-secondary/35 backdrop-blur-sm",
          isSelected && "opacity-55"
        )}
      >
        <LabelTooltip label={classifyLabel} side="top">
          <div className="inline-flex items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground">
            {isQuickApply ? (
              <Zap className="h-3 w-3 fill-amber-500/20 text-amber-500" />
            ) : isDirectEmail ? (
              <Mail className="h-3 w-3 text-muted-foreground/80" />
            ) : (
              <ExternalLink className="h-3 w-3 text-muted-foreground/80" />
            )}
            <span>{classifyLabel}</span>
          </div>
        </LabelTooltip>
        <div className="my-1 w-px bg-border/70" />
        {isApplied ? (
          <LabelTooltip
            label={
              appliedDate
                ? new Date(appliedDate).toLocaleString()
                : "Applied"
            }
            side="top"
          >
            <div className="inline-flex items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground">
              Applied {appliedLabel}
            </div>
          </LabelTooltip>
        ) : (
          <LabelTooltip
            label={opportunity.matchReason ?? null}
            side="top"
          >
            <div
              className={cn(
                "inline-flex items-center px-2.5",
                SCORE_PERCENT_CLASSNAME,
                isSelected
                  ? "bg-muted/50 text-muted-foreground"
                  : scoreTone(score)
              )}
            >
              {score}%
            </div>
          </LabelTooltip>
        )}
      </div>

      {/* Header: logo + role with clearance below corner pills */}
      <div className="flex items-center gap-2.5 px-6 pt-9 pb-3 sm:px-7">
        <CompanyLogo
          src={companyLogoSrc}
          name={opportunity.company}
          size="lg"
        />
        <div
          className={cn("min-w-0 flex-1", isSelected && "text-muted-foreground")}
        >
          <div className="flex h-4 items-center gap-1.5">
            <h4 className="truncate text-[11px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
              {opportunity.company}
            </h4>
            {statusTag}
            {vectorBadge}
          </div>
          <h3
            className={cn(
              "mt-0.5 truncate text-base font-semibold leading-snug",
              isSelected ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {opportunity.title}
          </h3>
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
          "flex flex-1 flex-col justify-start py-3.5",
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
        />

        {opportunity.matchReason ? (
          <div className="mt-auto flex items-start gap-2 px-3.5 pt-3">
            <WavyDashedFrame
              data-match-reason-box=""
              className="w-full rounded-lg bg-muted/20 p-2.5 dark:bg-muted/10"
            >
              <p className="min-h-[3lh] text-[11px] leading-relaxed text-muted-foreground/80">
                {hasRichDescription ? (
                  <span title="Full spec heuristic evaluation" className="mr-1.5 inline-flex h-[1lh] items-center align-bottom">
                    <Sparkles
                      aria-label="Full spec heuristic evaluation"
                      className="h-3 w-3 text-blue-500"
                    />
                  </span>
                ) : (
                  <span title="Slim title & leveling evaluation" className="mr-1.5 inline-flex h-[1lh] items-center align-bottom">
                    <Sparkle
                      aria-label="Slim title & leveling evaluation"
                      className="h-3 w-3 text-muted-foreground/80"
                    />
                  </span>
                )}
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
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/90 py-3 pl-4 pr-2 sm:pl-5">
            <div className="flex min-w-0 items-center">
              {variant === "history" && dismissed ? (
                <span className="inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {daysLeft}d left
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
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
