"use client";

import type { ReactNode } from "react";

import {
  CompanyLogo,
  type CompanyLogoProps,
} from "@/components/ui/logo-frame";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type DialogIdentityHeaderProps = {
  /**
   * Sheet title — the subject of the dialog (role, subject line, or a short
   * noun/imperative like "Unsubscribe", "New Snapshot", "Edit Profile").
   */
  title: string;
  /** Subtitle identity (company, sender, count, …) */
  primary: string;
  /** Muted second piece after the dot (name, date, …) */
  secondary?: string | null;
  logoSrc?: string | null;
  logoName?: string;
  logoSize?: CompanyLogoProps["size"];
  /** Replace the default CompanyLogo (e.g. stacked marks for batch). */
  logo?: ReactNode;
  /**
   * Which subtitle piece gets `text-foreground` (optional).
   * Default `secondary` when both pieces exist (e.g. email • Name).
   * Omit / leave default when the title already carries the lead and the
   * subtitle should stay muted (e.g. company under a job title).
   */
  emphasize?: "primary" | "secondary";
  /** Optional meta row under primary • secondary (salary, location, …). */
  meta?: ReactNode;
  className?: string;
};

/**
 * Shared popup chrome for identity-led dialogs:
 * `[logo]  <Title>`
 * `        primary • secondary`
 *
 * Prefer the thing itself as title (role, subject, "Unsubscribe") over
 * progressive chrome ("Responding to:", "Unsubscribing from:").
 */
export function DialogIdentityHeader({
  title,
  primary,
  secondary,
  logoSrc = null,
  logoName,
  logoSize = "jobCard",
  logo,
  emphasize = "secondary",
  meta,
  className,
}: DialogIdentityHeaderProps) {
  const mark =
    logo ??
    (logoName ? (
      <CompanyLogo src={logoSrc} name={logoName} size={logoSize} />
    ) : null);
  // Title already owns the lead; only lift subtitle ink when callers opt in.
  const primaryClass =
    emphasize === "primary"
      ? "min-w-0 break-words text-foreground"
      : "min-w-0 break-words";
  const secondaryClass =
    emphasize === "secondary"
      ? "min-w-0 break-words text-foreground"
      : "min-w-0 break-words";

  return (
    <DialogHeader
      className={cn(
        "shrink-0 space-y-0 border-b border-border/60 px-4 pb-4 pt-4 pr-12 text-left",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {mark ? <div className="flex shrink-0 items-center self-center">{mark}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <DialogTitle className="font-brand text-xl font-semibold leading-tight tracking-tight">
            {title}
          </DialogTitle>
          {primary || secondary || meta ? (
            <div className="mt-0.5 flex min-h-5 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              {primary || secondary ? (
                <DialogDescription className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                  <span className={primaryClass}>{primary}</span>
                  {secondary ? (
                    <>
                      <span className="shrink-0 text-muted-foreground/60">•</span>
                      <span className={secondaryClass}>{secondary}</span>
                    </>
                  ) : null}
                </DialogDescription>
              ) : null}
              {meta ? (
                <>
                  {primary || secondary ? (
                    <span
                      className="shrink-0 text-[11px] font-medium leading-none text-muted-foreground/60"
                      aria-hidden
                    >
                      •
                    </span>
                  ) : null}
                  <div className="min-w-0 shrink-0">{meta}</div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </DialogHeader>
  );
}

/** Overlapping CompanyLogo stack for multi-sender popups. */
export function DialogIdentityLogoStack({
  items,
  size = "jobCard",
  max = 3,
}: {
  items: { key: string; src: string | null; name: string }[];
  size?: CompanyLogoProps["size"];
  max?: number;
}) {
  const shown = items.slice(0, max);
  if (shown.length === 0) return null;
  if (shown.length === 1) {
    const only = shown[0]!;
    return <CompanyLogo src={only.src} name={only.name} size={size} />;
  }
  return (
    <div className="flex shrink-0 items-center pl-0.5">
      {shown.map((item, i) => (
        <div
          key={item.key}
          className={cn(i > 0 && "-ml-2")}
          style={{ zIndex: shown.length - i }}
        >
          <CompanyLogo src={item.src} name={item.name} size={size} />
        </div>
      ))}
    </div>
  );
}
