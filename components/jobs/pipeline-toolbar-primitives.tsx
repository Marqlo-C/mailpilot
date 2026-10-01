"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Layers, Search } from "lucide-react";

import { WavySlider } from "@/components/ui/wavy-slider";
import type {
  HistoryStatusFilter,
  SourceFilter,
} from "@/lib/opportunities/pipeline-filters";
import { TAB_SORT_CONFIG, type JobsTabKey } from "@/lib/opportunities/sorting";
import { cn } from "@/lib/utils";

export function ToolbarRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // 50px = border(2) + py-2(16) + h-8 wavy slider(32); keeps all tabs the same height
        "inline-flex min-h-[50px] w-fit max-w-full flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarDivider() {
  return (
    <div
      className="mx-1 hidden h-4 w-[1px] shrink-0 bg-border/60 sm:block"
      aria-hidden
    />
  );
}

export function ToolbarSelectAll({
  checked,
  indeterminate = false,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate && !checked;
    }
  }, [indeterminate, checked]);

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : "cursor-pointer text-muted-foreground hover:text-foreground"
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className={cn(
          "h-3.5 w-3.5 shrink-0 rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30",
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        )}
      />
      <span>{label}</span>
    </label>
  );
}

export function ToolbarScoreSlider({
  value,
  disabled = false,
  onChange,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="fit-score-threshold-input"
        className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Minimum Score:
      </label>
      <div className="relative inline-flex items-center">
        <input
          id="fit-score-threshold-input"
          type="number"
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const val =
              e.target.value === ""
                ? 0
                : Math.max(
                    0,
                    Math.min(100, parseInt(e.target.value, 10) || 0)
                  );
            onChange?.(val);
          }}
          onBlur={() => onCommit?.(value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="h-7 w-14 rounded-md border border-input bg-background/50 pr-3 text-center text-xs font-medium transition-colors [appearance:textfield] hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label="Minimum fit score percent"
        />
        <span className="pointer-events-none absolute right-1 text-[11px] text-muted-foreground">
          %
        </span>
      </div>
      <WavySlider
        value={value}
        disabled={disabled}
        onChange={(val) => onChange?.(val)}
        onCommit={(val) => onCommit?.(val)}
        widthClassName="w-28 sm:w-36"
        className="ml-2.5 sm:ml-3"
        aria-label="Minimum fit score"
      />
    </div>
  );
}

export function ToolbarSearch({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  return (
    <div className="relative flex h-7 w-[7.2rem] items-center text-muted-foreground focus-within:text-foreground sm:w-[9.6rem]">
      <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
      <input
        type="text"
        placeholder="Search roles..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-7 w-full rounded-md border border-input/60 bg-background/50 py-0 pr-2 pl-8 text-xs transition-colors placeholder:text-muted-foreground/60 hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Search roles, companies, or locations"
      />
    </div>
  );
}

export function ToolbarSourceFilter({
  value,
  onChange,
}: {
  value: SourceFilter;
  onChange: (value: SourceFilter) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SourceFilter)}
      className="h-7 cursor-pointer rounded-md border border-input/60 bg-background/50 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      aria-label="Filter by source"
    >
      <option value="all">All Sources</option>
      <option value="easy_apply">Easy Apply</option>
      <option value="external">External</option>
      <option value="email_lead">Email Lead</option>
    </select>
  );
}

export function ToolbarHistoryStatusFilter({
  value,
  onChange,
}: {
  value: HistoryStatusFilter;
  onChange: (value: HistoryStatusFilter) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as HistoryStatusFilter)}
      className="h-7 cursor-pointer rounded-md border border-input/60 bg-background/50 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      aria-label="Filter by history status"
    >
      <option value="all">All Statuses</option>
      <option value="archived">Archived</option>
      <option value="dismissed">Dismissed</option>
    </select>
  );
}

export function ToolbarSortSelect({
  activeTab,
  sortOption,
  onSortOptionChange,
}: {
  activeTab: JobsTabKey;
  sortOption: string;
  onSortOptionChange: (sort: string) => void;
}) {
  const options = TAB_SORT_CONFIG[activeTab].options;
  return (
    <select
      value={sortOption}
      onChange={(e) => onSortOptionChange(e.target.value)}
      className="h-7 cursor-pointer rounded-md border border-input/60 bg-background/50 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      aria-label="Sort listings"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ToolbarTelemetry({
  visibleCount,
  totalCount,
  hiddenCount,
}: {
  visibleCount: number;
  totalCount: number;
  hiddenCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
      <Layers className="h-3 w-3 shrink-0 text-muted-foreground/60" />
      <span>
        <strong className="font-medium text-foreground">{visibleCount}</strong>{" "}
        of {totalCount} listings
      </span>
      {hiddenCount > 0 ? (
        <>
          <span className="text-muted-foreground/30">·</span>
          <span className="font-medium text-muted-foreground/70">
            {hiddenCount} filtered
          </span>
        </>
      ) : null}
    </div>
  );
}
