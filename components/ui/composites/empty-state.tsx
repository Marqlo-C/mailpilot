import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Visual size variants for the EmptyState composite component.
 * - sm: Compact, suitable for inside nested cards, dialog sections, or narrow panels.
 * - md: Standard size, suitable for card views, tables, and tab panes.
 * - lg: Prominent, suitable for full-page or primary viewport empty states.
 */
export interface EmptyStateProps {
  /** Optional icon component displayed centered above the title. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Primary heading summarizing the empty state. */
  title: string;
  /** Secondary explanatory text or instructions. */
  description?: React.ReactNode;
  /** Call-to-action button or interaction slot. */
  action?: React.ReactNode;
  /** Container padding and typography scale variant. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /** Optional container class overrides. */
  className?: string;
}

const SIZE_CONFIGS = {
  sm: {
    container: "px-4 py-6",
    icon: "h-5 w-5 mb-2 text-muted-foreground/70",
    title: "font-brand text-xs font-semibold text-foreground",
    description: "mt-0.5 text-xs text-muted-foreground",
    action: "mt-3",
  },
  md: {
    container: "px-6 py-12",
    icon: "h-7 w-7 mb-3 text-muted-foreground/70",
    title: "font-brand text-sm sm:text-base font-semibold text-foreground",
    description: "mt-1 text-xs sm:text-sm text-muted-foreground",
    action: "mt-4",
  },
  lg: {
    container: "px-6 py-16",
    icon: "h-8 w-8 mb-3 text-muted-foreground/70",
    title: "font-brand text-base sm:text-lg font-bold tracking-tight text-foreground",
    description: "mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto",
    action: "mt-5",
  },
} as const;

/**
 * Reusable empty state presentation primitive for MailPilot.
 *
 * Standardizes dashed border geometries, translucent backdrop surfaces,
 * and responsive typography across all application views and settings panels.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  const config = SIZE_CONFIGS[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 text-center",
        config.container,
        className
      )}
    >
      {Icon && <Icon className={config.icon} />}
      <p className={config.title}>{title}</p>
      {description ? (
        typeof description === "string" ? (
          <p className={config.description}>{description}</p>
        ) : (
          <div className={config.description}>{description}</div>
        )
      ) : null}
      {action ? <div className={config.action}>{action}</div> : null}
    </div>
  );
}
