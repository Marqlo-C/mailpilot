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
import { SETTINGS_SECTION_ICON_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import { ENTRY_CHIP_CLASSNAME } from "@/components/ui/tactile/entry-chip";
import { formatStatusPillTitle } from "@/lib/utils/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX } from "./slidable-badge-row";

import {
  type NestedCardLevel,
  NestedCardContext,
  useNestedCardLevel,
} from "./nested-card-context";
import {
  SettingsStatusPill,
  NESTED_PILL_TYPOGRAPHY,
  formatTitleCaseNode,
} from "./settings-status-pill";
import { TruncatedSubtitleWithTooltip } from "./truncated-subtitle";
import {
  CurvedCardDivider,
  CurvedVerticalDivider,
} from "./curved-card-divider";

export type { NestedCardLevel };
export {
  useNestedCardLevel,
  SettingsStatusPill,
  NESTED_PILL_TYPOGRAPHY,
  TruncatedSubtitleWithTooltip,
  CurvedCardDivider,
  CurvedVerticalDivider,
};

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
  const mounted = useHydrated();

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
          "overflow-hidden [container-type:inline-size]",
          mounted ? "transition-all duration-200" : "transition-none",
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
              <div
                className={cn(
                  "shrink-0",
                  level === 1 && SETTINGS_SECTION_ICON_CLASSNAME,
                  level === 4 && "mt-0.5"
                )}
              >
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
                  "size-4 shrink-0 text-muted-foreground",
                  mounted ? "transition-transform duration-200" : "transition-none",
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
  footer,
  children,
  className,
  headerClassName,
  contentClassName,
}: {
  logo?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  curvedDivider?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
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
      footer={footer}
      className={className}
      headerClassName={headerClassName}
      contentClassName={contentClassName}
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
  footer,
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
  footer?: React.ReactNode;
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
      footer={footer}
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

