"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useSidebarFlyout } from "@/components/layout/sidebar-flyout-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const FLYOUT_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-wide text-stone-500";

export const FLYOUT_FIELD_CLASS =
  "h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-[#e4f7f3] shadow-none outline-none placeholder:text-[#e4f7f3]/35 focus-visible:ring-1 focus-visible:ring-[#1ab5af]/60 disabled:opacity-50";

const PILL_SHELL_CLASS =
  "inline-flex h-8 shrink-0 items-center overflow-hidden rounded-full bg-white/10 shadow-none";

const PILL_BTN_CLASS =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#e4f7f3]/80 shadow-none transition-colors hover:bg-white/10 hover:text-[#e4f7f3] active:bg-[hsl(var(--sidebar-highlight))] active:text-[#e4f7f3] disabled:pointer-events-none disabled:opacity-25";

const DROPDOWN_TRIGGER_CLASS =
  "flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-[#e4f7f3] shadow-none outline-none transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/20 data-[state=open]:bg-[hsl(var(--sidebar-highlight))] data-[state=open]:text-[#e4f7f3] disabled:cursor-not-allowed disabled:opacity-50";

const DROPDOWN_CONTENT_CLASS =
  "z-[160] rounded-lg border border-white/10 bg-[hsl(var(--sidebar-panel))] p-1 text-[#e4f7f3] shadow-md";

const DROPDOWN_ITEM_CLASS =
  "cursor-pointer justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#e4f7f3]/80 focus:bg-white/10 focus:text-[#e4f7f3] data-[highlighted]:bg-white/10 data-[highlighted]:text-[#e4f7f3]";

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
        <button
          type="button"
          title={primary.label}
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
      </div>
    );
  }

  const SecondaryIcon = secondary.icon;
  return (
    <div className={cn(PILL_SHELL_CLASS, dualWidthClass)}>
      <button
        type="button"
        title={primary.label}
        aria-label={primary.label}
        disabled={primary.disabled}
        onClick={primary.onClick}
        className={cn(PILL_BTN_CLASS, "size-8 rounded-l-full")}
      >
        <PrimaryIcon
          className={cn("size-3.5", primary.busy && "animate-spin")}
        />
      </button>
      <span
        aria-hidden="true"
        className="h-3.5 w-px shrink-0 bg-white/20 pointer-events-none"
      />
      <button
        type="button"
        title={secondary.label}
        aria-label={secondary.label}
        disabled={secondary.disabled}
        onClick={secondary.onClick}
        className={cn(PILL_BTN_CLASS, "size-8 rounded-r-full")}
      >
        <SecondaryIcon
          className={cn("size-3.5", secondary.busy && "animate-spin")}
        />
      </button>
    </div>
  );
}

/** Dark settings-style select for sidebar flyouts. */
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
  const selected = options.find((option) => option.value === value);
  return (
    // Non-modal: modal menus set body pointer-events:none, which fires
    // pointerleave on hover-open sidebar flyouts and closes them.
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) cancelScheduledClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled || options.length === 0}
          className={cn(DROPDOWN_TRIGGER_CLASS, className)}
        >
          <span className="min-w-0 truncate">
            {selected?.label ?? placeholder ?? "Select"}
          </span>
          <ChevronDown
            className="mr-0.5 size-3.5 shrink-0 text-[#e4f7f3]/55"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(
          DROPDOWN_CONTENT_CLASS,
          "w-[var(--radix-dropdown-menu-trigger-width)]"
        )}
      >
        {options.length === 0 ? (
          <DropdownMenuItem disabled className={DROPDOWN_ITEM_CLASS}>
            {placeholder ?? "No options"}
          </DropdownMenuItem>
        ) : (
          options.map((option) => {
            const isSelected = option.value === value;
            return (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => {
                  if (option.value === value) return;
                  onChange(option.value);
                }}
                className={DROPDOWN_ITEM_CLASS}
              >
                <span className="truncate">{option.label}</span>
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    isSelected ? "opacity-100" : "opacity-0"
                  )}
                />
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
