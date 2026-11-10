import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  NestedCardLevel,
  SettingsStatusPill,
} from "@/components/ui/tactile";
import { formatStatusPillTitle } from "@/lib/utils/format";
import { ICON_SQUIRCLE_CLASSNAME } from "@/components/features/settings/profile/platform-mark";

/** Show stored skill headings in Title Case. All-caps labels are recased; mixed case is kept. */
export function skillHeading(label: string): string {
  const letters = label.replace(/[^A-Za-z]/g, "");
  if (letters.length > 0 && letters === letters.toUpperCase()) {
    return formatStatusPillTitle(label.toLowerCase());
  }
  return label;
}

export const SKILL_HEADING_CLASSNAME =
  "text-xs font-semibold text-foreground/90 tracking-normal";

export function ContactChannel({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <span className={ICON_SQUIRCLE_CLASSNAME} aria-hidden="true">
        <Icon className="size-[18px] text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-foreground">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function SectionCountPill({
  level,
  count,
  hasItems,
  children,
  dotClassName,
  className,
}: {
  level?: NestedCardLevel;
  count?: number;
  hasItems?: boolean;
  children: React.ReactNode;
  dotClassName?: string;
  className?: string;
}) {
  if (count === 0 || hasItems === false) {
    return null;
  }

  return (
    <SettingsStatusPill
      level={level}
      count={count}
      hasItems={hasItems}
      dotClassName={dotClassName}
      className={className}
    >
      {children}
    </SettingsStatusPill>
  );
}

/** Last master-profile save, rendered in the browser's timezone. */
export function ProfileUpdatedStamp({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) {
      setLabel(null);
      return;
    }
    setLabel(
      parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    );
  }, [iso]);

  if (!label) return null;

  return (
    <span className="shrink-0 text-[11px] text-muted-foreground">
      Updated {label}
    </span>
  );
}

export function FormattedBulletText({
  text,
  hasMetric,
  variantsCount = 0,
  onToggleVariants,
}: {
  text: string;
  hasMetric: boolean;
  variantsCount?: number;
  onToggleVariants?: () => void;
}) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);

  const metricBadge = hasMetric ? (
    <Badge
      variant="outline"
      className="ml-1.5 inline-flex align-middle rounded-md px-1.5 py-0 font-mono text-[9px] shrink-0 whitespace-nowrap"
    >
      metric
    </Badge>
  ) : null;

  const variantButton =
    variantsCount > 0 && onToggleVariants ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVariants();
        }}
        className="ml-1.5 inline-flex items-center gap-1 rounded border border-border/80 bg-muted/40 px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span>
          {variantsCount} variant{variantsCount === 1 ? "" : "s"}
        </span>
      </button>
    ) : null;

  if (words.length <= 1) {
    return (
      <span className="inline">
        <span>{trimmed}</span>
        {metricBadge}
        {variantButton}
      </span>
    );
  }

  const leadingText = words.slice(0, -1).join(" ") + " ";
  const lastWord = words[words.length - 1];

  return (
    <span className="inline">
      <span>{leadingText}</span>
      <span className="inline-block whitespace-nowrap">
        <span>{lastWord}</span>
        {metricBadge}
        {variantButton}
      </span>
    </span>
  );
}
