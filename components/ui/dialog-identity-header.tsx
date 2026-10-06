"use client";

import type { ReactNode } from "react";

import {
  CompanyLogo,
  type CompanyLogoProps,
} from "@/components/ui/company-logo";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type DialogIdentityHeaderProps = {
  /**
   * Present-progressive action title ending with a colon.
   * Examples: "Responding to:", "Creating snapshot for:",
   * "Viewing snap for:", "Unsubscribing from:".
   */
  title: string;
  /** Emphasized identity (company, sender name, role title, …) */
  primary: string;
  /** Muted second piece after the dot (email, company, …) */
  secondary?: string | null;
  logoSrc?: string | null;
  logoName?: string;
  logoSize?: CompanyLogoProps["size"];
  /** Replace the default CompanyLogo (e.g. stacked marks for batch). */
  logo?: ReactNode;
  /**
   * Which identity piece gets `text-foreground` emphasis.
   * Default `secondary` — e.g. email • Name, or role • Company.
   */
  emphasize?: "primary" | "secondary";
  className?: string;
};

/**
 * Shared popup chrome for identity-led dialogs:
 * `[logo]  <Action statement>:`
 * `        primary • secondary`
 *
 * Title syntax: present-progressive verb phrase + trailing colon
 * (e.g. "Responding to:", "Creating snapshot for:", "Unsubscribing from:").
 * Prefer action-in-progress wording over noun labels ("Create Snapshot").
 */
export function DialogIdentityHeader({
  title,
  primary,
  secondary,
  logoSrc = null,
  logoName,
  logoSize = "lg",
  logo,
  emphasize = "secondary",
  className,
}: DialogIdentityHeaderProps) {
  const mark =
    logo ??
    (logoName ? (
      <CompanyLogo src={logoSrc} name={logoName} size={logoSize} />
    ) : null);
  // When there's no secondary line, always emphasize the primary.
  const emphasizePrimary =
    emphasize === "primary" || !secondary;
  const primaryClass = emphasizePrimary
    ? "min-w-0 break-words text-foreground"
    : "min-w-0 break-words";
  const secondaryClass =
    emphasize === "secondary"
      ? "min-w-0 break-words text-foreground"
      : "min-w-0 break-words";

  return (
    <DialogHeader
      className={cn(
        "shrink-0 space-y-0 border-b border-border/60 px-6 pb-3 pt-4 pr-12 text-left",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {mark}
        <div className="-mt-0.5 flex min-w-0 flex-col">
          <DialogTitle className="text-lg font-semibold leading-tight tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs font-medium text-muted-foreground">
            <span className={primaryClass}>{primary}</span>
            {secondary ? (
              <>
                <span className="shrink-0 text-muted-foreground/60">•</span>
                <span className={secondaryClass}>{secondary}</span>
              </>
            ) : null}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}

/** Overlapping CompanyLogo stack for multi-sender popups. */
export function DialogIdentityLogoStack({
  items,
  size = "lg",
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
