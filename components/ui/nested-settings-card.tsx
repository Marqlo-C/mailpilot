"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type NestedCardLevel = 1 | 2 | 3 | 4;

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
    header: "p-3.5 space-y-0 hover:bg-muted/20 transition-colors",
    title: "text-[13px] font-semibold tracking-tight text-foreground",
    subtitle: "text-xs text-muted-foreground leading-relaxed",
    body: "p-3.5 space-y-3.5 text-xs leading-relaxed",
  },
  4: {
    container: "rounded-xl border border-border/70 bg-card/70 shadow-xs",
    header: "p-3.5 sm:p-4 space-y-2.5",
    title: "text-xs font-semibold text-foreground",
    subtitle: "text-[11px] text-muted-foreground leading-normal",
    body: "p-3.5 sm:p-4 space-y-3 bg-muted/20",
  },
} as const;

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
        "button, input, select, a, [role='switch']"
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
          "button, input, select, a, [role='switch']"
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
    <div
      className={cn(
        styles.container,
        "overflow-hidden transition-all duration-200",
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
        className={cn(
          styles.header,
          "flex items-center justify-between gap-3",
          collapsible &&
            (disabled
              ? "cursor-not-allowed opacity-75"
              : "cursor-pointer select-none"),
          headerClassName
        )}
      >
        <div
          className={cn(
            "flex gap-2.5 min-w-0",
            level === 4 ? "items-start" : "items-center"
          )}
        >
          {leading && (
            <div className={cn("shrink-0", level === 4 && "mt-0.5")}>
              {leading}
            </div>
          )}
          <div className="min-w-0 space-y-0.5">
            <div className={styles.title}>{title}</div>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {trailing}
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

      {curvedDivider && isExpanded && <CurvedCardDivider />}

      {isExpanded && children && (
        <div className={cn(styles.body, contentClassName)}>{children}</div>
      )}

      {isExpanded && footer && (
        <div className="border-t border-border/50 bg-muted/20 px-3.5 py-2.5 sm:px-4">
          {footer}
        </div>
      )}
    </div>
  );
}
