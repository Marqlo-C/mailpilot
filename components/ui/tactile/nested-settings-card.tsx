"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatStatusPillTitle } from "@/lib/utils/format";
import { SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX } from "./slidable-badge-row";

export type NestedCardLevel = 1 | 2 | 3 | 4;

const NestedCardContext = React.createContext<{ level: NestedCardLevel }>({ level: 1 });

export function useNestedCardLevel(): NestedCardLevel {
  return React.useContext(NestedCardContext).level;
}

export const NESTED_PILL_TYPOGRAPHY = {
  1: {
    container: "rounded-full bg-muted/80 text-foreground px-2.5 py-0.5 text-xs gap-1.5",
    dot: "size-2",
  },
  2: {
    container: "rounded-full bg-muted/80 text-foreground px-2.5 py-0.5 text-[11px] gap-1.5",
    dot: "size-1.5",
  },
  3: {
    container: "rounded-md border border-border/60 text-muted-foreground px-2 py-0.5 text-[10px] gap-1 tracking-tight",
    dot: "size-1",
  },
  4: {
    container: "rounded-md border border-border/60 text-muted-foreground px-1.5 py-0.5 text-[9.5px] gap-1 tracking-tight",
    dot: "size-1",
  },
} as const;

function formatTitleCaseNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return formatStatusPillTitle(node);
  }
  if (Array.isArray(node)) {
    return React.Children.map(node, formatTitleCaseNode);
  }
  if (
    React.isValidElement<{ children?: React.ReactNode }>(node) &&
    node.props &&
    node.props.children !== undefined
  ) {
    return React.cloneElement(
      node,
      undefined,
      formatTitleCaseNode(node.props.children)
    );
  }
  return node;
}

/**
 * Tactical status pill that automatically scales down in typography, padding,
 * and dot size as nesting depth increases (Level 1 > Level 2 > Level 3 > Level 4).
 * Level 3 and Level 4 entries inherit clean, bordered chip styling matching date pills.
 */
export function SettingsStatusPill({
  level: explicitLevel,
  showDot: explicitShowDot,
  dotClassName,
  count,
  hasItems,
  children,
  className,
}: {
  level?: NestedCardLevel;
  showDot?: boolean;
  dotClassName?: string;
  count?: number;
  hasItems?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const contextLevel = useNestedCardLevel();
  const level = explicitLevel ?? contextLevel ?? 2;
  const config = NESTED_PILL_TYPOGRAPHY[level];
  const showDot = explicitShowDot ?? (level < 3);

  const isPositive =
    hasItems !== undefined ? hasItems : typeof count === "number" ? count > 0 : undefined;

  const resolvedDot =
    dotClassName ??
    (isPositive !== undefined
      ? isPositive
        ? "bg-emerald-500"
        : "bg-muted-foreground/60"
      : "bg-muted-foreground/60");

  const formattedChildren = formatTitleCaseNode(children);

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium shrink-0",
        config.container,
        className
      )}
    >
      {showDot && (
        <span
          className={cn("rounded-full shrink-0", config.dot, resolvedDot)}
          aria-hidden="true"
        />
      )}
      {formattedChildren}
    </span>
  );
}

export const NESTED_CARD_TYPOGRAPHY = {
  1: {
    container: "rounded-xl border border-border/80 bg-card shadow-md",
    header: "p-3.5 space-y-0",
    title: "text-base font-semibold leading-none tracking-tight text-foreground",
    subtitle: "text-xs text-muted-foreground leading-normal",
    body: "p-4 space-y-4",
  },
  2: {
    container: "rounded-xl border border-border/70 bg-card/60 shadow-xs",
    header: "p-3.5 space-y-0",
    title: "text-sm font-semibold tracking-tight text-foreground",
    subtitle: "text-xs text-muted-foreground leading-normal",
    body: "p-3.5 space-y-2.5 bg-muted/10",
  },
  3: {
    container: "rounded-xl border border-border/70 bg-card/70 shadow-xs",
    header: "px-3.5 py-3 min-h-[62px] space-y-0 hover:bg-muted/20 transition-colors",
    title: "text-[13px] font-semibold tracking-tight text-foreground truncate",
    subtitle: "text-xs text-muted-foreground leading-normal w-fit max-w-[min(100%,90cqw)]",
    body: "p-3.5 space-y-3.5 text-xs leading-relaxed",
  },
  4: {
    container: "rounded-xl border border-border/70 bg-card/70 shadow-xs",
    header: "p-3.5 sm:p-4 space-y-2.5",
    title: "text-xs font-semibold text-foreground",
    subtitle: "text-[11px] text-muted-foreground leading-normal w-fit max-w-[min(100%,90cqw)]",
    body: "p-3.5 sm:p-4 space-y-3 bg-muted/20",
  },
} as const;

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCtx = sharedCanvas.getContext("2d");
  }
  if (!sharedCtx) return text.length * 7;
  sharedCtx.font = font;
  return sharedCtx.measureText(text).width;
}

function computeWordTruncatedText(
  fullText: string,
  targetWidth: number,
  font: string
): { displayText: string; isTruncated: boolean } {
  const words = fullText.trim().split(/\s+/);
  if (words.length <= 1) {
    return { displayText: fullText, isTruncated: false };
  }

  let accumulated = "";
  let isTruncated = false;

  for (let i = 0; i < words.length; i++) {
    const candidate = accumulated ? `${accumulated} ${words[i]}` : words[i];
    const width = measureTextWidth(candidate, font);

    if (width > targetWidth) {
      // Complete the word that was in progress at the 80% mark
      accumulated = candidate;
      isTruncated = i < words.length - 1 || width > targetWidth;
      break;
    }

    accumulated = candidate;
  }

  if (!isTruncated || accumulated === fullText) {
    return { displayText: fullText, isTruncated: false };
  }

  const cleaned = accumulated.replace(/[,;:\s]+$/, "");
  return { displayText: `${cleaned}...`, isTruncated: true };
}

/**
 * Subtitle text clamped to 80% of the card row width plus the full finished word
 * if a word is in progress at the 80% mark.
 * Hovering pops a tooltip displaying the complete text when truncated.
 */
export function TruncatedSubtitleWithTooltip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [truncatedState, setTruncatedState] = React.useState<{
    displayText: string;
    isTruncated: boolean;
  }>(() => ({
    displayText: text,
    isTruncated: false,
  }));

  const updateTruncation = React.useCallback(() => {
    const el = textRef.current;
    if (!el || !text) return;

    const cardRow = el.closest<HTMLElement>("[data-card-row]");
    const cardRowWidth =
      cardRow?.clientWidth || el.parentElement?.clientWidth || window.innerWidth;
    const availableWidth =
      el.parentElement?.clientWidth || cardRowWidth * 0.8;
    // Target 80% of card row width, constrained by available flex space
    const targetWidth = Math.min(cardRowWidth * 0.8, availableWidth);

    const style = window.getComputedStyle(el);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const next = computeWordTruncatedText(text, targetWidth, font);
    setTruncatedState((prev) => {
      if (
        prev.displayText === next.displayText &&
        prev.isTruncated === next.isTruncated
      ) {
        return prev;
      }
      return next;
    });
  }, [text]);

  React.useEffect(() => {
    updateTruncation();
    const el = textRef.current;
    if (!el) return;

    const cardRow = el.closest<HTMLElement>("[data-card-row]");
    const observer = new ResizeObserver(() => {
      updateTruncation();
    });

    observer.observe(el);
    if (cardRow) {
      observer.observe(cardRow);
    }
    if (el.parentElement) {
      observer.observe(el.parentElement);
    }

    return () => {
      observer.disconnect();
    };
  }, [updateTruncation, text]);

  if (!text || !text.trim()) {
    return null;
  }

  const textElement = (
    <span
      ref={textRef}
      onMouseEnter={updateTruncation}
      className={cn("block truncate w-fit max-w-full", className)}
    >
      {truncatedState.displayText}
    </span>
  );

  if (!truncatedState.isTruncated) {
    return textElement;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{textElement}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-sm sm:max-w-md whitespace-normal break-words text-left text-xs leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Curved divider separating card header from body.
 * Arches across horizontally and curves downward into the card body at both ends
 * with the card's 12px (rounded-xl) corner radius.
 */
export function CurvedCardDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex w-full items-start overflow-hidden pointer-events-none select-none text-border/60 -mb-3 z-10",
        className
      )}
    >
      {/* Left corner arc: curves from (0.5, 12) on left border up to (12, 0.5) */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="shrink-0 overflow-visible"
      >
        <path
          d="M 0.5 12 A 11.5 11.5 0 0 1 12 0.5"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

      {/* Center horizontal line */}
      <div className="flex-1 border-t border-current" />

      {/* Right corner arc: curves from (0, 0.5) down to (11.5, 12) on right border */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="shrink-0 overflow-visible"
      >
        <path
          d="M 0 0.5 A 11.5 11.5 0 0 1 11.5 12"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

export interface NestedSettingsCardProps {
  level: NestedCardLevel;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  collapsible?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  curvedDivider?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function NestedSettingsCard({
  level,
  title,
  subtitle,
  leading,
  trailing,
  collapsible = false,
  isExpanded = true,
  onToggle,
  disabled = false,
  curvedDivider = false,
  footer,
  children,
  className,
  headerClassName,
  contentClassName,
}: NestedSettingsCardProps) {
  const styles = NESTED_CARD_TYPOGRAPHY[level];

  const handleHeaderClick = (e: React.MouseEvent) => {
    // Prevent collapsing when clicking interactive controls in trailing/leading slots
    if (
      (e.target as HTMLElement).closest(
        "button, input, select, a, [role='switch'], [data-no-toggle]"
      )
    ) {
      return;
    }
    if (collapsible && !disabled && onToggle) {
      onToggle();
    }
  };

  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      if (
        (e.target as HTMLElement).closest(
          "button, input, select, a, [role='switch'], [data-no-toggle]"
        )
      ) {
        return;
      }
      e.preventDefault();
      if (collapsible && !disabled && onToggle) {
        onToggle();
      }
    }
  };

  return (
    <NestedCardContext.Provider value={{ level }}>
      <div
        className={cn(
          styles.container,
          "overflow-hidden transition-all duration-200 [container-type:inline-size]",
          className
        )}
      >
        <div
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? (disabled ? -1 : 0) : undefined}
          aria-expanded={collapsible ? isExpanded : undefined}
          aria-disabled={collapsible ? disabled : undefined}
          onClick={handleHeaderClick}
          onKeyDown={collapsible ? handleHeaderKeyDown : undefined}
          data-card-row=""
          className={cn(
            styles.header,
            "flex items-center justify-between gap-3 [container-type:inline-size]",
            collapsible &&
              (disabled
                ? "cursor-not-allowed opacity-75"
                : "cursor-pointer select-none"),
            headerClassName
          )}
        >
          <div
            className={cn(
              "flex gap-2.5 min-w-0 flex-1",
              level === 4 ? "items-start" : "items-center"
            )}
          >
            {leading && (
              <div className={cn("shrink-0", level === 4 && "mt-0.5")}>
                {leading}
              </div>
            )}
            <div className="min-w-0 space-y-0.5 flex-1">
              <div className={styles.title}>{title}</div>
              {subtitle && (
                <div
                  className={cn(
                    styles.subtitle,
                    "min-w-0 w-fit max-w-[min(100%,90cqw)]"
                  )}
                >
                  {typeof subtitle === "string" ? (
                    <TruncatedSubtitleWithTooltip text={subtitle} />
                  ) : (
                    subtitle
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className={cn(
              "flex items-center gap-2.5 shrink-0",
              headerClassName?.includes("items-start") && "mt-0.5"
            )}
          >
            {trailing}
            {collapsible && Boolean(trailing) && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-4 w-px bg-border/70 shrink-0",
                  disabled && "opacity-40"
                )}
              />
            )}
            {collapsible && (
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-180",
                  disabled && "opacity-40"
                )}
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {curvedDivider && isExpanded && Boolean(children) && <CurvedCardDivider />}

        {isExpanded && children && (
          <div className={cn(styles.body, contentClassName)}>{children}</div>
        )}

        {isExpanded && footer && (
          <div className="border-t border-border/50 bg-muted/20 px-3.5 py-2.5 sm:px-4">
            {footer}
          </div>
        )}
      </div>
    </NestedCardContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC LEVEL WRAPPERS FOR CONSUMING PAGES
// ─────────────────────────────────────────────────────────────────────────────

/** Level 1: Master Section Card (Outer boundary with Master Toggle or Collapsible Header) */
export function SettingsSectionCard({
  icon,
  title,
  subtitle,
  toggle,
  collapsible,
  isExpanded = true,
  onToggle,
  curvedDivider = true,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  toggle?: React.ReactNode;
  collapsible?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  curvedDivider?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <NestedSettingsCard
      level={1}
      leading={icon}
      title={title}
      subtitle={subtitle}
      trailing={toggle}
      collapsible={collapsible ?? Boolean(onToggle)}
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider={curvedDivider}
      className={className}
    >
      {children}
    </NestedSettingsCard>
  );
}

/** Level 2: Feature / Sub-Service Card (Collapsible feature with brand logo & status pill) */
export function SettingsFeatureCard({
  logo,
  title,
  subtitle,
  statusBadge,
  isExpanded = true,
  onToggle,
  disabled = false,
  curvedDivider = true,
  children,
  className,
  headerClassName,
}: {
  logo?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  curvedDivider?: boolean;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <NestedSettingsCard
      level={2}
      leading={logo}
      title={title}
      subtitle={subtitle}
      trailing={statusBadge}
      collapsible={Boolean(onToggle)}
      isExpanded={isExpanded}
      onToggle={onToggle}
      disabled={disabled}
      curvedDivider={curvedDivider}
      className={className}
      headerClassName={headerClassName}
    >
      {children}
    </NestedSettingsCard>
  );
}

/** Level 3: Numbered Workflow Step Card */
export function SettingsStepCard({
  step,
  title,
  subtitle,
  actionButton,
  isExpanded = true,
  onToggle,
  disabled = false,
  curvedDivider = true,
  footer,
  children,
  className,
}: {
  step: number | string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actionButton?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  curvedDivider?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <NestedSettingsCard
      level={3}
      leading={
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
          {step}
        </span>
      }
      title={title}
      subtitle={subtitle}
      trailing={actionButton}
      collapsible={Boolean(onToggle)}
      isExpanded={isExpanded}
      onToggle={onToggle}
      disabled={disabled}
      curvedDivider={curvedDivider}
      footer={footer}
      className={className}
    >
      {children}
    </NestedSettingsCard>
  );
}

/**
 * Indent for text blocks inside a Level 3 entry card. Body padding is 14px; 34px
 * margins on each side bring text to 48px (header px 14 + badge 24 + gap 10),
 * flush with the title text, with a matching right edge.
 */
export const ENTRY_CARD_TEXT_INDENT_CLASSNAME = "mx-[34px]";

/** Row that holds a squircle marker and the first line of bullet text. */
export const BULLET_ROW_CLASSNAME = "flex items-start gap-2.5";

/**
 * 6px #363b43 squircle. With `items-start`, `mt-[7px]` puts its center on the
 * cap-height of the first line (Geist, `text-xs`/`text-sm`), not the line box.
 */
export function BulletSquircle() {
  return (
    <span
      className="size-1.5 shrink-0 rounded-[2px] bg-[#363b43] mt-[7px] select-none"
      aria-hidden="true"
    />
  );
}

/**
 * Squircle bullet list for a Level 3 entry card. Each bullet uses a small
 * #363b43 rounded square in place of a dot, aligned to the cap-height of the
 * first text line. Equal side margins equal to the carousel's leading offset
 * put the bullet's left edge flush with the first carousel pill, and wrapping
 * stops the same distance from the right.
 */
export function EntryBulletList({
  items,
  className,
}: {
  items: { key: string; content: React.ReactNode }[];
  className?: string;
}) {
  return (
    <ul
      className={cn("space-y-2", className)}
      style={{
        marginInline: `${SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX}px`,
      }}
    >
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(BULLET_ROW_CLASSNAME, "text-xs leading-relaxed")}
        >
          <BulletSquircle />
          <span className="min-w-0 flex-1 text-foreground/90">{item.content}</span>
        </li>
      ))}
    </ul>
  );
}

/** Level 3: Individual Entry / Item Card (Expandable entry within a feature section, e.g. a role, project, school, award) */
export function SettingsEntryCard({
  index,
  step,
  title,
  subtitle,
  leading,
  trailing,
  isExpanded = true,
  onToggle,
  disabled = false,
  curvedDivider = true,
  children,
  className,
  headerClassName,
  contentClassName,
}: {
  index?: number | string;
  step?: number | string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  curvedDivider?: boolean;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}) {
  const itemNumber = index ?? step;
  const resolvedLeading =
    leading ??
    (itemNumber !== undefined ? (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
        {itemNumber}
      </span>
    ) : undefined);

  return (
    <NestedSettingsCard
      level={3}
      leading={resolvedLeading}
      title={title}
      subtitle={subtitle}
      trailing={trailing}
      collapsible={Boolean(onToggle)}
      isExpanded={isExpanded}
      onToggle={onToggle}
      disabled={disabled}
      curvedDivider={curvedDivider}
      className={className}
      headerClassName={headerClassName}
      contentClassName={contentClassName}
    >
      {children}
    </NestedSettingsCard>
  );
}

/** Level 4: Inner State & Control Container (Live bridge status, terminal info & model selector) */
export function SettingsStatusCard({
  title,
  subtitle,
  statusDot,
  badge,
  curvedDivider = false,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  statusDot?: React.ReactNode;
  badge?: React.ReactNode;
  curvedDivider?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <NestedSettingsCard
      level={4}
      leading={statusDot}
      title={title}
      subtitle={subtitle}
      trailing={badge}
      curvedDivider={curvedDivider}
      className={className}
    >
      {children}
    </NestedSettingsCard>
  );
}

