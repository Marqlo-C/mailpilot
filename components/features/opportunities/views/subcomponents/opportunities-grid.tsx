import type React from "react";
import { useEffect, useRef } from "react";
import type { JobOpportunity } from "@prisma/client";

import {
  OpportunityCard,
  type OpportunityCardProps,
  type OpportunityCardVariant,
} from "@/components/features/opportunities/cards/opportunity-card";

export type OpportunitiesGridProps = {
  opportunities: JobOpportunity[];
  paginatedJobs: JobOpportunity[];
  emptyText: string;
  variant: OpportunityCardVariant;
  matchThreshold: number;
  busy: boolean;
  retentionDays: number;
  selectedIds: string[];
  lastClickedId: string | null;
  isEmbeddedAiEnabled?: boolean;
  isAutoDispatchEnabled?: boolean;
  onToggleSelect: (id: string) => void;
  bindItem: (id: string) => OpportunityCardProps["itemProps"];
  marker: { insertBeforeId: string | null; insertAfterLast: boolean };
  previewFullIds?: string[] | null;
  onReviewDraft?: (opp: JobOpportunity) => void;
  onSendNow?: (opp: JobOpportunity) => void;
  onMarkApplied?: (opp: JobOpportunity) => void;
  onUnmarkApplied?: (opp: JobOpportunity) => void;
  onViewOriginalEmail?: (opp: JobOpportunity) => void;
  onLessLikeThis?: (opp: JobOpportunity) => void;
};

/**
 * Responsive card grid displaying current page of job opportunities or empty placeholder.
 * Synchronizes reason-box heights across 2-column cards on desktop screens.
 */
export function OpportunitiesGrid({
  opportunities,
  paginatedJobs,
  emptyText,
  variant,
  matchThreshold,
  busy,
  retentionDays,
  selectedIds,
  lastClickedId,
  isEmbeddedAiEnabled,
  isAutoDispatchEnabled,
  onToggleSelect,
  bindItem,
  marker,
  previewFullIds,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onUnmarkApplied,
  onViewOriginalEmail,
  onLessLikeThis,
}: OpportunitiesGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    function syncMatchReasonHeights() {
      if (!grid) return;
      const isTwoCol = window.matchMedia("(min-width: 768px)").matches;
      const cards = grid.querySelectorAll<HTMLElement>(
        "article[data-opportunity-card]"
      );
      if (!cards || cards.length === 0) return;

      if (!isTwoCol) {
        cards.forEach((card) => {
          const box = card.querySelector<HTMLElement>(
            "[data-match-reason-box]"
          );
          if (box) box.style.minHeight = "";
        });
        return;
      }

      // Group cards in pairs for each 2-card row
      for (let i = 0; i < cards.length; i += 2) {
        const cardA = cards[i];
        const cardB = cards[i + 1];
        const boxA = cardA?.querySelector<HTMLElement>(
          "[data-match-reason-box]"
        );
        const boxB = cardB?.querySelector<HTMLElement>(
          "[data-match-reason-box]"
        );

        if (boxA) boxA.style.minHeight = "";
        if (boxB) boxB.style.minHeight = "";

        if (boxA && boxB) {
          const hA = boxA.offsetHeight;
          const hB = boxB.offsetHeight;
          const maxHeight = Math.max(hA, hB);
          if (maxHeight > 0) {
            boxA.style.minHeight = `${maxHeight}px`;
            boxB.style.minHeight = `${maxHeight}px`;
          }
        }
      }
    }

    syncMatchReasonHeights();

    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(syncMatchReasonHeights);
    });

    observer.observe(grid);

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(syncMatchReasonHeights);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [paginatedJobs]);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="relative z-0 grid min-w-0 gap-3 md:grid-cols-2"
      data-dnd-list
      data-dnd-previewing={previewFullIds ? "true" : undefined}
    >
      {paginatedJobs.map((opp) => (
        <OpportunityCard
          key={opp.id}
          opportunity={opp}
          matchThreshold={matchThreshold}
          variant={variant}
          pending={busy}
          retentionDays={retentionDays}
          isSelected={selectedIds.includes(opp.id)}
          isLastClicked={lastClickedId === opp.id}
          isEmbeddedAiEnabled={isEmbeddedAiEnabled}
          isAutoDispatchEnabled={isAutoDispatchEnabled}
          onToggleSelect={onToggleSelect}
          itemProps={bindItem(opp.id)}
          showInsertBefore={marker.insertBeforeId === opp.id}
          onReviewDraft={() => onReviewDraft?.(opp)}
          onSendNow={() => onSendNow?.(opp)}
          onMarkApplied={() => onMarkApplied?.(opp)}
          onUnmarkApplied={() => onUnmarkApplied?.(opp)}
          onViewOriginalEmail={
            onViewOriginalEmail ? () => onViewOriginalEmail(opp) : undefined
          }
          onLessLikeThis={
            variant === "history" || !onLessLikeThis
              ? undefined
              : () => onLessLikeThis(opp)
          }
        />
      ))}
      {marker.insertAfterLast ? (
        <div
          className="pointer-events-none col-span-full h-0.5 bg-[#1ab5af]"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
