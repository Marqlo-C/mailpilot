"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Layers, ListFilter, Mic, Search, X } from "lucide-react";

import { ToolbarMenuSelect } from "@/components/ui/app-menu";
import { SELECT_CHECKBOX_CLASSNAME } from "@/components/ui/styles/select-checkbox";
import { LabelTooltip } from "@/components/ui/tooltip";
import { NumericField } from "@/components/ui/tactile/numeric-field";
import { WavySlider } from "@/components/ui/tactile/wavy-slider";
import type {
  HistoryStatusFilter,
  SourceFilter,
} from "@/lib/opportunities/pipeline-filters";
import { TAB_SORT_CONFIG, type JobsTabKey } from "@/lib/opportunities/sorting";
import { cn } from "@/lib/utils";

/** Toolbar filter/sort select — tracks light/dark toolbar preference. */
export const ToolbarNativeSelect = ToolbarMenuSelect;

export function ToolbarRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-mp-toolbar=""
      className={cn(
        // Sit above ToolbarMetaRow so the search filters panel isn't covered
        // by the page-size control (later sibling otherwise paints on top).
        // Dark plate: html[data-mp-toolbar=dark] in globals.css.
        // Full shell column — same width as tab rail + Sync (listing stays max-w-6xl).
        "relative z-10 flex w-full flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card/80 px-2 py-2 shadow-md backdrop-blur-sm lg:flex-nowrap",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Equal flex share of {@link ToolbarRoot}. Pair two of these around a
 * {@link ToolbarDivider} so the rule sits at the measured midpoint.
 */
export function ToolbarHalf({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 basis-0 items-center gap-3",
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
      data-mp-toolbar-meta=""
      className={cn(
        // 1px inset past the listing column each side (+2px width/side vs prior). mb-0 — fade gap.
        "relative z-0 mx-auto mb-0 flex w-full max-w-[calc(72rem-2px)] items-center justify-between px-3 py-0.5 text-xs text-foreground/80",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarDivider({ className }: { className?: string }) {
  return (
    <div
      data-mp-toolbar-divider=""
      className={cn(
        "mx-1 hidden h-4 w-[1px] shrink-0 bg-border/60 sm:block",
        className
      )}
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
  /** Accessible name only — no visible Select All / Deselect All text. */
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
        "inline-flex shrink-0 items-center",
        disabled ? "cursor-not-allowed opacity-35" : "cursor-pointer"
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={label}
        className={cn(
          SELECT_CHECKBOX_CLASSNAME,
          "m-0 h-3.5 w-3.5 shrink-0",
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        )}
      />
    </label>
  );
}

export function ToolbarScoreSlider({
  value,
  disabled = false,
  onChange,
  onCommit,
  label = "Match Filter:",
  labelTooltip,
  inputId = "fit-score-threshold-input",
  ariaLabel = "Match filter",
}: {
  value: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
  label?: string;
  /** Hover description for the label (e.g. how Noise / Match is scored). */
  labelTooltip?: string;
  inputId?: string;
  ariaLabel?: string;
}) {
  const labelNode = (
    <label
      htmlFor={inputId}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground/75 transition-colors hover:text-foreground"
    >
      {label}
    </label>
  );

  return (
    // Fills the remaining width of its {@link ToolbarHalf} parent.
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {labelTooltip ? (
        <LabelTooltip label={labelTooltip} side="bottom" contentClassName="max-w-xs text-left">
          {labelNode}
        </LabelTooltip>
      ) : (
        labelNode
      )}
      <NumericField
        id={inputId}
        value={value}
        min={0}
        max={100}
        step={1}
        percent
        steppers
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(val) => onChange?.(val)}
        onCommit={(val) => onCommit?.(val)}
      />
      <WavySlider
        value={value}
        disabled={disabled}
        onChange={(val) => onChange?.(val)}
        onCommit={(val) => onCommit?.(val)}
        widthClassName="min-w-0 w-full"
        className="ml-2.5 min-w-0 flex-1 sm:ml-3"
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
  const [panelBox, setPanelBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // AppMenu / Radix menus portal outside the filter panel. Closing on
      // mousedown unmounts the select before onSelect fires — sorts/filters
      // looked broken after the native <select> → AppMenu swap.
      if (
        target instanceof Element &&
        target.closest(
          "[data-radix-dropdown-menu-content],[data-radix-popper-content-wrapper],[role='menu']"
        )
      ) {
        return;
      }
      setFiltersOpen(false);
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

  // The deck fade is a mask on the sticky bar, so an in-bar panel is clipped.
  // Measure the field and paint the panel on document.body instead.
  useLayoutEffect(() => {
    if (!filtersOpen) return;
    const node = rootRef.current;
    if (!node) return;

    function measure() {
      const rect = node!.getBoundingClientRect();
      const next = {
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      };
      setPanelBox((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width
          ? prev
          : next
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      setPanelBox(null);
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
      <div
        data-mp-toolbar-field=""
        className="flex h-8 w-full items-center gap-1.5 rounded-lg border border-border/50 bg-card/75 pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow"
      >
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
      {hasFilters && filtersOpen && panelBox
        ? createPortal(
            <div
              ref={panelRef}
              role="region"
              aria-label="Filter and sort"
              data-filter-panel
              data-dnd-ignore
              data-mp-toolbar=""
              className="z-50 flex w-max flex-col gap-2.5 rounded-lg border border-border/50 bg-card p-2.5 shadow-md sm:flex-row sm:flex-wrap sm:items-end"
              style={{
                position: "fixed",
                top: panelBox.top,
                left: panelBox.left + panelBox.width,
                transform: "translateX(-100%)",
              }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
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
        "flex w-max max-w-full flex-col gap-1",
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
    <ToolbarMenuSelect
      value={value}
      onChange={(next) => onChange(next as SourceFilter)}
      aria-label="Filter by type"
      className={className}
      options={[
        { value: "all", label: "All Types" },
        { value: "easy_apply", label: "Easy Apply" },
        { value: "external", label: "External" },
        { value: "email_lead", label: "Email Lead" },
      ]}
    />
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
    <ToolbarMenuSelect
      value={value}
      onChange={(next) => onChange(next as HistoryStatusFilter)}
      aria-label="Filter by history status"
      className={className}
      options={[
        { value: "all", label: "All Statuses" },
        { value: "archived", label: "Archived" },
        { value: "dismissed", label: "Dismissed" },
      ]}
    />
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
  return (
    <ToolbarMenuSelect
      value={sortOption}
      onChange={onSortOptionChange}
      aria-label="Sort listings"
      className={className}
      options={TAB_SORT_CONFIG[activeTab].options}
    />
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
          className="ml-1.5 cursor-pointer text-[11px] font-medium text-[#129f96] underline underline-offset-2 hover:text-[#0f8f87]"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
