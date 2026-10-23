"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LayoutList,
  RotateCcw,
} from "lucide-react";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { selectCheckboxClassName } from "@/components/ui/styles/select-checkbox";
import {
  getSelectionGroupEdges,
  selectHighlightGroupClassName,
} from "@/components/ui/styles/select-highlight";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { reorderIds } from "@/lib/dnd/reorder";
import { OutboundStatusPill } from "./status-pill";
import { cn } from "@/lib/utils";
import { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { useLastClickedId } from "@/hooks/use-last-clicked-id";
import { DragGhost, type DragGhostStackItem } from "@/components/dnd/drag-ghost";
import type { CardListGestureRules } from "@/lib/dnd/types";

const SECTION_METADATA: Record<
  string,
  { label: string; description: string }
> = {
  summary: {
    label: "Professional Summary",
    description: "High-level career trajectory and target field focus",
  },
  skills: {
    label: "Skills & Core Competencies",
    description: "Core skills, tools, and areas of expertise",
  },
  experience: {
    label: "Work Experience & History",
    description: "Chronological roles with achievement and responsibility bullets",
  },
  projects: {
    label: "Projects & Practical Work",
    description: "Key initiatives, deliverables, and portfolio links",
  },
  education: {
    label: "Education & Academics",
    description: "Academic credentials, institutions, and coursework",
  },
  certifications: {
    label: "Certifications & Licenses",
    description: "Industry credentials, professional certificates, and licenses",
  },
  awards: {
    label: "Honors & Awards",
    description: "Distinctions, scholarships, and recognized achievements",
  },
  interests: {
    label: "Interests & Activities",
    description: "Personal interests, community leadership, and activities",
  },
};

interface CanonicalSectionLayoutCardProps {
  inventMetrics: boolean;
  sectionOrderingMode: "AI_OPTIMAL" | "MANUAL";
  contentInclusionMode: "AI_OPTIMAL" | "MANUAL";
  sections: string[];
  visibility: Record<string, boolean>;
  disabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onReorder: (newOrder: string[]) => void;
  onToggleVisibility: (sectionKey: string, visible: boolean) => void;
}

export function CanonicalSectionLayoutCard({
  inventMetrics,
  sectionOrderingMode,
  contentInclusionMode,
  sections,
  visibility,
  disabled,
  isLocked,
  isExpanded,
  onToggle,
  onReorder,
  onToggleVisibility,
}: CanonicalSectionLayoutCardProps) {
  const isOrderingAi = sectionOrderingMode === "AI_OPTIMAL";
  const isInclusionAi = contentInclusionMode === "AI_OPTIMAL";

  // Reorder is interactive only when not locked and ordering is manual
  const isOrderingInteractive = !isLocked && !isOrderingAi && !disabled;
  // Visibility is interactive only when not locked and inclusion is manual
  const isVisibilityInteractive = !isLocked && !isInclusionAi && !disabled;

  // Multi-card selection for batch move and hold-and-slide gestures
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const { lastClickedId, markLastClicked } = useLastClickedId(
    selectedIds,
    sections
  );

  // Status Badge Label
  const badgeLabel = isLocked
    ? "Managed by AI"
    : isOrderingAi
      ? inventMetrics
        ? "Custom Selection · Dynamic Order & Estimates"
        : "Custom Selection · Dynamic Order"
      : isInclusionAi
        ? inventMetrics
          ? "Custom Order · AI Selection & Estimates"
          : "Custom Order · AI Selection"
        : inventMetrics
          ? "Custom Order & Selection · AI Estimates"
          : "Full Custom Control";

  const enterSelectionMode = useCallback(
    (id: string) => {
      if (!isOrderingInteractive) return;
      markLastClicked(id);
      setSelectionMode(true);
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [isOrderingInteractive, markLastClicked]
  );

  const toggleSelect = useCallback(
    (key: string) => {
      if (!isOrderingInteractive) return;
      markLastClicked(key);
      setSelectedIds((prev) => {
        const next = prev.includes(key)
          ? prev.filter((id) => id !== key)
          : [...prev, key];
        setSelectionMode(next.length > 0);
        return next;
      });
    },
    [isOrderingInteractive, markLastClicked]
  );

  const paintSelect = useCallback(
    (id: string, mode: "add" | "remove") => {
      if (!isOrderingInteractive) return;
      markLastClicked(id);
      setSelectedIds((prev) => {
        if (mode === "add") {
          if (prev.includes(id)) return prev;
          setSelectionMode(true);
          return [...prev, id];
        }
        const next = prev.filter((i) => i !== id);
        setSelectionMode(next.length > 0);
        return next;
      });
    },
    [isOrderingInteractive, markLastClicked]
  );

  const clearSelection = useCallback(() => {
    markLastClicked(null);
    setSelectionMode(false);
    setSelectedIds([]);
  }, [markLastClicked]);

  useEffect(() => {
    if (!isOrderingInteractive && selectedIds.length > 0) {
      clearSelection();
    }
  }, [isOrderingInteractive, selectedIds.length, clearSelection]);

  const gestureRules: CardListGestureRules = useMemo(
    () => ({
      canReorder: isOrderingInteractive,
    }),
    [isOrderingInteractive]
  );

  const { drag, bindItem, onBackgroundPointerDown } = useCardListGestures({
    pageItemIds: sections,
    fullItemIds: sections,
    selectedIds,
    selectionMode: selectionMode || selectedIds.length > 0,
    onEnterSelectionMode: enterSelectionMode,
    onToggleSelect: toggleSelect,
    onPaintSelect: paintSelect,
    onClearSelection: clearSelection,
    rules: gestureRules,
    currentPage: 1,
    totalPages: 1,
    pageSize: sections.length,
    onPageChange: () => {},
    onReorder: (nextFullIds) => {
      onReorder(nextFullIds);
    },
  });

  const displaySections = useMemo(() => {
    if (drag?.previewFullIds) {
      return drag.previewFullIds;
    }
    return sections;
  }, [drag?.previewFullIds, sections]);

  const dragLabel = useMemo(() => {
    if (!drag?.active || drag.movedIds.length === 0) return null;
    const primaryKey = drag.originId || drag.movedIds[0];
    const meta = SECTION_METADATA[primaryKey];
    return meta?.label ?? primaryKey;
  }, [drag]);

  const dragStackItems = useMemo(() => {
    if (!drag?.active) return [];
    const orderedKeys = [
      drag.originId,
      ...drag.movedIds.filter((id) => id !== drag.originId),
    ].slice(0, 4);
    return orderedKeys.map((key) => {
      const meta = SECTION_METADATA[key];
      const item: DragGhostStackItem = {
        name: meta?.label ?? key,
        subtitle: meta?.description ?? null,
        logoSrc: null,
      };
      return item;
    });
  }, [drag]);

  // Batch-aware Move Up
  function handleMoveUp(key: string, index: number) {
    if (!isOrderingInteractive) return;
    if (selectedIds.includes(key) && selectedIds.length > 1) {
      const indices = selectedIds
        .map((id) => sections.indexOf(id))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const minIndex = indices[0];
      if (minIndex > 0) {
        const newOrder = reorderIds(sections, selectedIds, minIndex - 1);
        onReorder(newOrder);
      }
    } else {
      if (index > 0) {
        const newOrder = reorderIds(sections, [key], index - 1);
        onReorder(newOrder);
      }
    }
  }

  // Batch-aware Move Down
  function handleMoveDown(key: string, index: number) {
    if (!isOrderingInteractive) return;
    if (selectedIds.includes(key) && selectedIds.length > 1) {
      const indices = selectedIds
        .map((id) => sections.indexOf(id))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const maxIndex = indices[indices.length - 1];
      if (maxIndex < sections.length - 1) {
        const withoutTarget = maxIndex + 2 - selectedIds.length;
        const newOrder = reorderIds(sections, selectedIds, withoutTarget);
        onReorder(newOrder);
      }
    } else {
      if (index < sections.length - 1) {
        const newOrder = reorderIds(sections, [key], index + 1);
        onReorder(newOrder);
      }
    }
  }

  return (
    <SettingsFeatureCard
      logo={
        <div
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 shadow-sm",
            isLocked && "opacity-50"
          )}
          aria-hidden="true"
        >
          <div className="flex size-full items-center justify-center rounded-[0.6rem] bg-muted/30">
            <LayoutList
              className={cn(
                "size-5",
                isLocked ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            />
          </div>
        </div>
      }
      title="Section Order & Selection"
      subtitle={
        isLocked
          ? "AI is currently arranging your sections dynamically. Switch to Manual Ordering or Manual Content Selection above to customize."
          : "Drag to reorder sections, or toggle switches to include or hide sections by default."
      }
      statusBadge={
        isLocked ? (
          <OutboundStatusPill isRecommended={true}>{badgeLabel}</OutboundStatusPill>
        ) : (
          <OutboundStatusPill isRecommended={false}>{badgeLabel}</OutboundStatusPill>
        )
      }
      isExpanded={!isLocked && isExpanded}
      onToggle={onToggle}
      disabled={isLocked}
      curvedDivider
    >
      <div className="space-y-3" onPointerDown={onBackgroundPointerDown}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground px-1.5 pt-0.5">
          <div>
            {isOrderingAi && !isInclusionAi && (
              <span>Section order is arranged dynamically by AI. Switches below set your section selection.</span>
            )}
            {!isOrderingAi && isInclusionAi && (
              <span>Sections follow your manual order below, while AI selects role-targeted highlights for each job.</span>
            )}
            {!isOrderingAi && !isInclusionAi && (
              <span>Full manual control: hold & slide or check rows to multi-select, drag to reorder, and toggle switches to include or hide sections.</span>
            )}
          </div>

          {/* Selected count info pill (without calling any bulk menu) */}
          {selectedIds.length > 0 && isOrderingInteractive && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {selectedIds.length} highlighted for batch move
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Conjoined Section Rows Container (styled after Subscriptions shell) */}
        <div
          data-dnd-list
          className="relative w-full rounded-xl border border-border/80 bg-card shadow-md transition-shadow duration-200 hover:shadow-lg"
        >
          {displaySections.map((key, index) => {
            const meta = SECTION_METADATA[key] ?? {
              label: key,
              description: "",
            };
            const isVisible = visibility[key] ?? true;
            const isSelected = selectedIds.includes(key);
            const selectionGroup = getSelectionGroupEdges(
              displaySections,
              selectedIds,
              index
            );

            // Up/Down button enabling logic
            const isFirst = index === 0;
            const isLast = index === displaySections.length - 1;
            const canMoveUp = isOrderingInteractive && !isFirst;
            const canMoveDown = isOrderingInteractive && !isLast;

            const itemProps = bindItem(key);
            const { style: itemStyle, ...itemRest } = itemProps;
            const isMoved =
              Boolean(drag?.active) && Boolean(drag?.movedIds.includes(key));

            return (
              <div
                key={key}
                {...itemRest}
                style={itemStyle}
                className={cn(
                  "group relative flex min-h-[58px] cursor-default items-stretch select-none transition-colors",
                  isFirst && "rounded-t-xl",
                  isLast && "rounded-b-xl",
                  isSelected
                    ? selectHighlightGroupClassName(selectionGroup, {
                        startRadius: isFirst ? "xl" : "sm",
                        endRadius: isLast ? "xl" : "sm",
                      })
                    : cn(
                        "hover:bg-muted/30",
                        !isVisible && "opacity-60 bg-muted/10"
                      ),
                  isMoved && "opacity-30 bg-primary/10"
                )}
              >
                {/* Left Edge: Half-width Grab Handle (w-3.5) with Sidebar-Derived Cool Gray Spine & Self-Contained Outline */}
                <div
                  className={cn(
                    "relative z-20 flex w-3.5 shrink-0 flex-col items-center justify-center gap-[3px] select-none transition-colors",
                    "-ml-px",
                    isFirst && "-mt-px rounded-tl-xl",
                    isLast && "-mb-px rounded-bl-xl",
                    isSelected
                      ? cn(
                          "border-l border-r border-b border-primary/40 bg-primary/15 text-primary",
                          isFirst && "border-t border-primary/40"
                        )
                      : cn(
                          "border-l border-r border-b border-[hsl(var(--tab-rail-chip))] dark:border-[hsl(210_16%_26%)] bg-[hsl(var(--tab-rail-light))] dark:bg-[hsl(210_20%_18%)] text-[hsl(210_18%_45%)] dark:text-[hsl(210_16%_65%)]",
                          isFirst && "border-t border-[hsl(var(--tab-rail-chip))] dark:border-[hsl(210_16%_26%)]"
                        ),
                    isOrderingInteractive
                      ? "cursor-grab active:cursor-grabbing hover:bg-[hsl(var(--tab-rail-chip))] dark:hover:bg-[hsl(210_18%_24%)] hover:text-[hsl(var(--sidebar))] dark:hover:text-[hsl(var(--sidebar-foreground))] group-hover:text-[hsl(var(--sidebar))] dark:group-hover:text-[hsl(var(--sidebar-foreground))]"
                      : "cursor-not-allowed opacity-40 text-[hsl(210_14%_60%)] dark:text-[hsl(210_14%_40%)]"
                  )}
                  title={
                    isOrderingInteractive
                      ? isSelected && selectedIds.length > 1
                        ? "Drag to move highlighted batch together"
                        : "Hold & slide to multi-select, or drag to reorder"
                      : "Section ordering locked by AI"
                  }
                >
                  {[0, 1, 2, 3, 4, 5].map((rowIdx) => (
                    <div
                      key={rowIdx}
                      className="flex items-center gap-[3px] pointer-events-none"
                    >
                      <span className="size-[2px] rounded-full bg-current transition-colors" />
                      <span className="size-[2px] rounded-full bg-current transition-colors" />
                    </div>
                  ))}
                </div>

                {/* Row Content */}
                <div
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3",
                    isFirst && "rounded-tr-xl",
                    isLast && "rounded-br-xl",
                    !isSelected && !isLast && "border-b border-border/50 dark:border-border/60"
                  )}
                >
                  {/* Batch Selection Checkbox */}
                  <input
                    type="checkbox"
                    id={`select-${key}`}
                    checked={isSelected}
                    disabled={!isOrderingInteractive}
                    onChange={() => toggleSelect(key)}
                    className={selectCheckboxClassName({
                      lastClicked: lastClickedId === key,
                      className: cn(
                        "size-3.5 shrink-0 cursor-pointer m-0",
                        !isOrderingInteractive && "opacity-30 cursor-not-allowed"
                      ),
                    })}
                    aria-label={`Select ${meta.label} for batch move`}
                  />

                  {/* Step Number Badge (Styled after Step Cards in AI & Models) */}
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-colors shadow-xs",
                      isVisible
                        ? "bg-primary/10 border border-primary/20 text-primary"
                        : "bg-muted/60 border border-border/50 text-muted-foreground/60"
                    )}
                  >
                    {index + 1}
                  </span>

                  {/* Center: Title & Subtitle */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "text-[13px] font-semibold tracking-tight truncate",
                          isVisible ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {meta.label}
                      </span>
                      {!isVisible && (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive shrink-0">
                          Omitted
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        "truncate text-xs leading-relaxed transition-colors duration-150",
                        isVisible ? "text-muted-foreground" : "text-muted-foreground/60"
                      )}
                    >
                      {meta.description}
                    </p>
                  </div>

                  {/* Right Edge: Up/Down Buttons + Divider + WaveToggle */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Up / Down Move Pill */}
                    <div className="inline-flex items-center rounded-full bg-muted/70 shadow-none shrink-0 overflow-hidden">
                      <button
                        type="button"
                        disabled={!canMoveUp}
                        onClick={() => handleMoveUp(key, index)}
                        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-l-full border-0 bg-transparent text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] active:bg-[hsl(var(--sidebar))] active:text-[hsl(var(--sidebar-foreground))] disabled:pointer-events-none disabled:opacity-25"
                        title={
                          isSelected && selectedIds.length > 1
                            ? "Move highlighted batch up"
                            : `Move ${meta.label} up`
                        }
                        aria-label={`Move ${meta.label} up`}
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-px bg-border/70 shrink-0 pointer-events-none"
                      />
                      <button
                        type="button"
                        disabled={!canMoveDown}
                        onClick={() => handleMoveDown(key, index)}
                        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-r-full border-0 bg-transparent text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] active:bg-[hsl(var(--sidebar))] active:text-[hsl(var(--sidebar-foreground))] disabled:pointer-events-none disabled:opacity-25"
                        title={
                          isSelected && selectedIds.length > 1
                            ? "Move highlighted batch down"
                            : `Move ${meta.label} down`
                        }
                        aria-label={`Move ${meta.label} down`}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>

                    {/* Vertical divider */}
                    <span
                      aria-hidden="true"
                      className="h-4 w-px bg-border/70 shrink-0"
                    />

                    {/* Selection Toggle */}
                    <div className="flex items-center shrink-0">
                      <WaveToggle
                        id={`vis-${key}`}
                        checked={isVisible}
                        disabled={!isVisibilityInteractive}
                        aria-label={`Toggle selection of ${meta.label}`}
                        onCheckedChange={(checked) =>
                          onToggleVisibility(key, checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DragGhost
          active={Boolean(drag?.active)}
          pointerX={drag?.pointerX ?? 0}
          pointerY={drag?.pointerY ?? 0}
          grab={drag?.grab ?? null}
          count={drag?.movedIds.length ?? 0}
          label={dragLabel}
          stackItems={dragStackItems}
          outsideList={Boolean(drag?.outsideList)}
        />
      </div>
    </SettingsFeatureCard>
  );
}

export default CanonicalSectionLayoutCard;
