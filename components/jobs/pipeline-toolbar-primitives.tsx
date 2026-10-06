"use client";

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { ChevronDown, Layers, Search } from "lucide-react";

import { SELECT_CHECKBOX_CLASSNAME } from "@/components/ui/select-checkbox";
import { WavySlider } from "@/components/ui/wavy-slider";
import type {
  HistoryStatusFilter,
  SourceFilter,
} from "@/lib/opportunities/pipeline-filters";
import { TAB_SORT_CONFIG, type JobsTabKey } from "@/lib/opportunities/sorting";
import { cn } from "@/lib/utils";

/**
 * Native select with a custom chevron so left inset (to text) matches
 * right inset (from arrow to edge). Browser arrows sit flush and look uneven.
 */
export function ToolbarNativeSelect({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"select">) {
  return (
    <div className="relative inline-flex shrink-0">
      <select
        {...props}
        className={cn(
          "h-7 cursor-pointer appearance-none rounded-md border border-input/60 bg-card py-0 pl-2.5 pr-7 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-card focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

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
        "flex w-full flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card p-3 shadow-md lg:flex-nowrap",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Secondary meta bar under the filter card (counts + page size). */
export function ToolbarMetaRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2.5 flex items-center justify-between px-1 py-0.5 text-xs text-foreground/80",
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
          ? "cursor-not-allowed text-foreground/35"
          : "cursor-pointer text-foreground/75 hover:text-foreground"
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className={cn(
          SELECT_CHECKBOX_CLASSNAME,
          "m-0 h-3.5 w-3.5 shrink-0",
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
  label = "Match Threshold:",
  inputId = "fit-score-threshold-input",
  ariaLabel = "Match score threshold",
}: {
  value: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
  label?: string;
  inputId?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={inputId}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground/75 transition-colors hover:text-foreground"
      >
        {label}
      </label>
      <div className="relative inline-flex items-center">
        <input
          id={inputId}
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
          className="h-7 w-14 rounded-md border border-input bg-card pr-3 text-center text-xs font-medium shadow-sm transition-colors [appearance:textfield] hover:bg-card focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={`${ariaLabel} percent`}
        />
        <span className="pointer-events-none absolute right-1 text-[11px] text-foreground/65">
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
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function ToolbarSearch({
  searchQuery,
  onSearchChange,
  placeholder = "Search roles, companies, or locations...",
  ariaLabel = "Search roles, companies, or locations",
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative flex h-7 w-[7.2rem] items-center text-foreground/75 focus-within:text-foreground sm:w-[9.6rem] md:w-[12rem]">
      <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-foreground/60" />
      <input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-7 w-full rounded-md border border-input/60 bg-card py-0 pr-2 pl-8 text-xs shadow-sm transition-colors placeholder:text-foreground/50 hover:bg-card focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={ariaLabel}
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
    <ToolbarNativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value as SourceFilter)}
      aria-label="Filter by source"
    >
      <option value="all">All Sources</option>
      <option value="easy_apply">Easy Apply</option>
      <option value="external">External</option>
      <option value="email_lead">Email Lead</option>
    </ToolbarNativeSelect>
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
    <ToolbarNativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value as HistoryStatusFilter)}
      aria-label="Filter by history status"
    >
      <option value="all">All Statuses</option>
      <option value="archived">Archived</option>
      <option value="dismissed">Dismissed</option>
    </ToolbarNativeSelect>
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
    <ToolbarNativeSelect
      value={sortOption}
      onChange={(e) => onSortOptionChange(e.target.value)}
      aria-label="Sort listings"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </ToolbarNativeSelect>
  );
}

export function ToolbarTelemetry({
  visibleCount,
  totalCount,
  hiddenCount,
  itemLabel = "listings",
  onResetFilters,
}: {
  visibleCount: number;
  totalCount: number;
  hiddenCount: number;
  itemLabel?: string;
  /** When set, renders a "Reset filters" action next to the count. */
  onResetFilters?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-foreground/80">
      <Layers className="h-3 w-3 shrink-0 text-foreground/70" />
      <span>
        <strong className="font-semibold text-foreground">{visibleCount}</strong>{" "}
        of {totalCount} {itemLabel}
      </span>
      {hiddenCount > 0 ? (
        <>
          <span className="text-foreground/45">·</span>
          <span className="font-medium text-foreground/75">
            {hiddenCount} filtered
          </span>
        </>
      ) : null}
      {onResetFilters ? (
        <button
          type="button"
          onClick={onResetFilters}
          className="ml-1.5 cursor-pointer text-xs font-medium text-teal-600 underline underline-offset-2 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Reset filters
        </button>
      ) : null}
    </div>
  );
}
