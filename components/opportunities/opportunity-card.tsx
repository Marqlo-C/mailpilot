"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import {
  Archive,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  XCircle,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  /** Optional overrides; defaults call lifecycle server actions. */
  onArchive?: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
};

function matchTone(score: number): string {
  if (score >= 80) {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
  if (score >= 60) {
    return "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function applicationTypeLabel(type: string): string {
  if (type === "DIRECT_EMAIL") return "Email Lead";
  if (type === "QUICK_APPLY") return "Quick Apply";
  return "External link";
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
  const initial = (company.trim()[0] ?? "?").toUpperCase();

  if (failed) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground"
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
      className="h-10 w-10 shrink-0 rounded-md bg-muted object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Rich JobOpportunity card with tab-specific lifecycle actions and
 * dismissed retention countdown.
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

  return (
    <Card
      className={cn(
        belowThreshold &&
          opportunity.isArchived &&
          !userArchived &&
          "opacity-90",
        isSelected && "border-primary bg-primary/5 shadow-sm"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{opportunity.company}</CardTitle>
              {variant === "history" ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold uppercase",
                    opportunity.isArchived && !dismissed
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  )}
                >
                  {opportunity.isArchived && !dismissed
                    ? "Archived"
                    : "Dismissed"}
                </Badge>
              ) : null}
            </div>
            <CardDescription>{opportunity.title}</CardDescription>
            {opportunity.description ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                {opportunity.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {opportunity.salary ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {opportunity.salary}
                </span>
              ) : null}
              {opportunity.postedAt ? (
                <Badge variant="outline" className="font-normal">
                  {opportunity.postedAt}
                </Badge>
              ) : null}
              {opportunity.location ? (
                <Badge variant="outline" className="font-normal">
                  <MapPin className="mr-1 h-3 w-3" />
                  {opportunity.location}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant="outline"
              className={cn("tabular-nums", matchTone(score))}
              title={opportunity.matchReason ?? undefined}
            >
              {score}%
            </Badge>
            <Badge variant="outline">
              {applicationTypeLabel(opportunity.applicationType)}
            </Badge>
            {opportunity.isArchived &&
            variant === "leads" &&
            !userArchived ? (
              <Badge variant="secondary">Below threshold</Badge>
            ) : null}
            {opportunity.status === "REVIEW_READY" ? (
              <Badge variant="secondary">Draft ready</Badge>
            ) : null}
          </div>
        </div>
        {opportunity.matchReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {opportunity.matchReason}
          </p>
        ) : null}
      </CardHeader>
      <CardFooter className="flex flex-col items-stretch gap-3">
        <div className="flex flex-wrap gap-2">
          {opportunity.applyUrl ? (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              View Posting
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span
              className="inline-flex items-center rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground"
              title="Apply link not detected in email digest; run Force Rescan to re-parse."
            >
              No apply link detected
            </span>
          )}

          {variant === "leads" ? (
            <>
              {canEmail ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={onReviewDraft}
                  >
                    <Mail className="h-4 w-4" />
                    Review & Edit Draft
                  </Button>
                  <Button size="sm" disabled={busy} onClick={onSendNow}>
                    <Send className="h-4 w-4" />
                    Send now
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={onMarkApplied}
                >
                  Mark applied
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={runArchive}
              >
                <Archive className="h-4 w-4" />
                Archive
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={runDismiss}
                className="text-destructive hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Dismiss
              </Button>
            </>
          ) : null}

          {variant === "action" ? (
            <>
              {canEmail ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={onReviewDraft}
                  >
                    <Mail className="h-4 w-4" />
                    Review & Edit Draft
                  </Button>
                  <Button size="sm" disabled={busy} onClick={onSendNow}>
                    <Send className="h-4 w-4" />
                    Send now
                  </Button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={runDismiss}
                className="text-destructive hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Dismiss
              </Button>
            </>
          ) : null}

          {variant === "applied" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onUnmarkApplied}
              >
                <Undo2 className="h-4 w-4" />
                Unmark Applied
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={runArchive}
              >
                <Archive className="h-4 w-4" />
                Archive
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={runDismiss}
                className="text-destructive hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Dismiss
              </Button>
            </>
          ) : null}

          {variant === "history" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={runRestore}
              >
                <RotateCcw className="h-4 w-4" />
                {restoreLabel}
              </Button>

              {/* Archived → Dismiss so it enters purge countdown / becomes deletable */}
              {opportunity.isArchived && !dismissed ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={runDismiss}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title="Move to Dismissed status to allow permanent deletion or auto-purge"
                >
                  <XCircle className="h-4 w-4" />
                  Dismiss
                </Button>
              ) : null}

              {dismissed ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {daysLeft}d left
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={runDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Received {receivedLabel}
        </p>
      </CardFooter>
    </Card>
  );
}
