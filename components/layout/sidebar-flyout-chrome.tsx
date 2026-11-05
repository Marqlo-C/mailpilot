"use client";

import { type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useSidebarFlyout } from "@/components/layout/sidebar-flyout-provider";
import { AppMenuSelect } from "@/components/ui/app-menu";
import { LabelTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const FLYOUT_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-wide text-stone-500";

export const FLYOUT_FIELD_CLASS =
  "h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-[#e4f7f3] shadow-none outline-none placeholder:text-[#e4f7f3]/35 focus-visible:ring-1 focus-visible:ring-[#1ab5af]/60 disabled:opacity-50";

const PILL_SHELL_CLASS =
  "inline-flex h-8 shrink-0 items-center overflow-hidden rounded-full bg-white/10 shadow-none";

const PILL_BTN_CLASS =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#e4f7f3]/80 shadow-none transition-colors hover:bg-white/10 hover:text-[#e4f7f3] active:bg-[hsl(var(--sidebar-highlight))] active:text-[#e4f7f3] disabled:pointer-events-none disabled:opacity-25";

type FlyoutIconAction = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
};

/** One or two icon actions in the same pill used by section-order up/down. */
export function FlyoutIconPill({
  primary,
  secondary,
  /** When alone, keep the save+clear footprint instead of a single circle. */
  matchPairWidth = Boolean(secondary),
}: {
  primary: FlyoutIconAction;
  secondary?: FlyoutIconAction;
  matchPairWidth?: boolean;
}) {
  const PrimaryIcon = primary.icon;
  const dualWidthClass = "w-[calc(4rem+1px)]";
  if (!secondary) {
    return (
      <div
        className={cn(
          PILL_SHELL_CLASS,
          matchPairWidth ? dualWidthClass : "size-8"
        )}
      >
        <LabelTooltip label={primary.label} side="top">
          <button
            type="button"
            aria-label={primary.label}
            disabled={primary.disabled}
            onClick={primary.onClick}
            className={cn(
              PILL_BTN_CLASS,
              "rounded-full",
              matchPairWidth ? "h-8 w-full" : "size-8"
            )}
          >
            <PrimaryIcon
              className={cn("size-3.5", primary.busy && "animate-spin")}
            />
          </button>
        </LabelTooltip>
      </div>
    );
  }

  const SecondaryIcon = secondary.icon;
  return (
    <div className={cn(PILL_SHELL_CLASS, dualWidthClass)}>
      <LabelTooltip label={primary.label} side="top">
        <button
          type="button"
          aria-label={primary.label}
          disabled={primary.disabled}
          onClick={primary.onClick}
          className={cn(PILL_BTN_CLASS, "size-8 rounded-l-full")}
        >
          <PrimaryIcon
            className={cn("size-3.5", primary.busy && "animate-spin")}
          />
        </button>
      </LabelTooltip>
      <span
        aria-hidden="true"
        className="h-3.5 w-px shrink-0 bg-white/20 pointer-events-none"
      />
      <LabelTooltip label={secondary.label} side="top">
        <button
          type="button"
          aria-label={secondary.label}
          disabled={secondary.disabled}
          onClick={secondary.onClick}
          className={cn(PILL_BTN_CLASS, "size-8 rounded-r-full")}
        >
          <SecondaryIcon
            className={cn("size-3.5", secondary.busy && "animate-spin")}
          />
        </button>
      </LabelTooltip>
    </div>
  );
}

/** Dark settings-style select for sidebar flyouts (`AppMenuSelect` surface). */
export function FlyoutSelect({
  id,
  value,
  options,
  placeholder,
  disabled,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  options: readonly { value: string; label: ReactNode }[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { cancelScheduledClose } = useSidebarFlyout();
  return (
    // Non-modal: modal menus set body pointer-events:none, which fires
    // pointerleave on hover-open sidebar flyouts and closes them.
    <AppMenuSelect
      id={id}
      surface="dark"
      modal={false}
      value={value}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      onChange={onChange}
      // Full field width — menu matches the bar, not the shortest label.
      className={cn("w-full", className)}
      matchTriggerWidth
      onOpenChange={(open) => {
        if (open) cancelScheduledClose();
      }}
    />
  );
}
