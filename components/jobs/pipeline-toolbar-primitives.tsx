"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { ChevronDown, Layers, ListFilter, Mic, Search, X } from "lucide-react";

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
        // Sit above ToolbarMetaRow so the search filters panel isn't covered
        // by the page-size control (later sibling otherwise paints on top).
        "relative z-10 flex w-full flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card/80 p-3 shadow-md backdrop-blur-sm lg:flex-nowrap",
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
        "relative z-0 mb-2.5 flex items-center justify-between px-1 py-0.5 text-xs text-foreground/80",
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
        "inline-flex shrink-0 items-center gap-2 text-xs font-medium transition-colors",
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
      {/* Size to the longer label so Select All ↔ Deselect All never shifts the toolbar. */}
      <span className="inline-grid">
        <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
          Deselect All
        </span>
        <span className="col-start-1 row-start-1 whitespace-nowrap">{label}</span>
      </span>
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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

/**
 * Search field that can host trailing filter/sort controls as children
 * (wrap each in {@link ToolbarSearchAddon}). Filters open in a panel
 * under the field so they stay usable on narrow screens.
 */
export function ToolbarSearch({
  searchQuery,
  onSearchChange,
  placeholder = "Looking for a role, company, or city? Let's get started...",
  ariaLabel = "Search jobs by role, company, or city",
  children,
  className,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Optional dropdown filters / sort controls rolled into the search chrome. */
  children?: ReactNode;
  className?: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onSearchChangeRef = useRef(onSearchChange);
  const hasFilters = Boolean(children);

  onSearchChangeRef.current = onSearchChange;

  // Prefer a readable search width without hogging the toolbar (long
  // conversational placeholders must not inflate flex-basis / crush Select All).
  // Chrome allowance: leading icon + trailing mic/filter circles + padding.
  const basisChars = Math.min(placeholder.length, 28);
  const preferredInputBasis = `calc(${basisChars}ch + 6.5rem)`;

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  function stopListening() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      return;
    }
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // Already stopped.
    }
    recognitionRef.current = null;
    setListening(false);
  }

  function toggleVoiceSearch() {
    if (listening) {
      stopListening();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      onSearchChangeRef.current(transcript.trim());
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.warn("Speech recognition error:", event.error);
      }
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }

  /** Clear / mic / filters — ellipsis-menu ghost fill, circular. */
  const trailingGhostActionClassName =
    "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))]";

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative min-w-0 max-w-full flex-1",
        filtersOpen && "z-50",
        className
      )}
      style={{ flexBasis: preferredInputBasis }}
    >
      <div className="flex h-8 w-full items-center gap-1.5 rounded-lg border border-border/50 bg-card/75 pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
        <Search
          className="pointer-events-none size-4 shrink-0 text-foreground/45"
          aria-hidden
        />
        <input
          type="text"
          placeholder={listening ? "Listening..." : placeholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
          aria-label={ariaLabel}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className={trailingGhostActionClassName}
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
          {speechSupported ? (
            <button
              type="button"
              aria-pressed={listening}
              aria-label={
                listening ? "Stop voice search" : "Start voice search"
              }
              onClick={toggleVoiceSearch}
              className={cn(
                trailingGhostActionClassName,
                listening &&
                  "bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              )}
            >
              <Mic className="size-4" aria-hidden />
            </button>
          ) : null}
          {hasFilters ? (
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-label={filtersOpen ? "Hide filters" : "Show filters"}
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                trailingGhostActionClassName,
                filtersOpen &&
                  "bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))]"
              )}
            >
              <ListFilter className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {hasFilters && filtersOpen ? (
        <div
          role="region"
          aria-label="Filter and sort"
          className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 flex flex-col gap-2.5 rounded-lg border border-border/50 bg-card p-2.5 shadow-md sm:flex-row sm:flex-wrap sm:items-end"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Slots a filter/sort control into the {@link ToolbarSearch} filters panel. */
export function ToolbarSearchAddon({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Visible role label — use "Filter" or "Sort" so the panel reads clearly. */
  label?: "Filter" | "Sort" | (string & {});
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 sm:w-auto [&>div]:w-full sm:[&>div]:w-auto [&_select]:w-full sm:[&_select]:w-auto",
        className
      )}
    >
      {label ? (
        <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

export function ToolbarSourceFilter({
  value,
  onChange,
  className,
}: {
  value: SourceFilter;
  onChange: (value: SourceFilter) => void;
  className?: string;
}) {
  return (
    <ToolbarNativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value as SourceFilter)}
      aria-label="Filter by source"
      className={className}
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
  className,
}: {
  value: HistoryStatusFilter;
  onChange: (value: HistoryStatusFilter) => void;
  className?: string;
}) {
  return (
    <ToolbarNativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value as HistoryStatusFilter)}
      aria-label="Filter by history status"
      className={className}
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
  className,
}: {
  activeTab: JobsTabKey;
  sortOption: string;
  onSortOptionChange: (sort: string) => void;
  className?: string;
}) {
  const options = TAB_SORT_CONFIG[activeTab].options;
  return (
    <ToolbarNativeSelect
      value={sortOption}
      onChange={(e) => onSortOptionChange(e.target.value)}
      aria-label="Sort listings"
      className={className}
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
          className="ml-1.5 cursor-pointer text-[11px] font-medium text-teal-600 underline underline-offset-2 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Reset filters
        </button>
      ) : null}
    </div>
  );
}
