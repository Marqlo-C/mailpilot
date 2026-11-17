"use client";

import {
  isValidElement,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

import type { Action } from "sonner";

import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_FLYOUT_PILL_CLASSNAME,
  BulkActionSeparator,
} from "@/components/ui/composites/bulk-actions-flyout";
import type {
  TactileToastRecord,
  TactileToastType,
} from "@/hooks/use-tactile-toasts";
import { cn } from "@/lib/utils";

export interface TactileToastItemProps {
  toast: TactileToastRecord;
  onDismiss: (id: string | number) => void;
  onAnimationEnd?: (
    id: string | number,
    event: AnimationEvent<HTMLDivElement>
  ) => void;
  style?: CSSProperties;
  className?: string;
  showDismissButton?: boolean;
  centerLabel?: boolean;
  animateIn?: boolean;
}

function isSonnerAction(val: unknown): val is Action {
  return typeof val === "object" && val !== null && "label" in val;
}

function ToastTypeIcon({
  type,
  customIcon,
}: {
  type: TactileToastType;
  customIcon?: ReactNode;
}) {
  if (customIcon) return <>{customIcon}</>;

  switch (type) {
    case "loading":
      return (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
        </span>
      );
    case "success":
      return (
        <CheckCircle2
          className="size-4 shrink-0 text-emerald-400 transition-transform duration-200"
          aria-hidden
        />
      );
    case "error":
      return (
        <AlertCircle
          className="size-4 shrink-0 text-[#fb7185] transition-transform duration-200"
          aria-hidden
        />
      );
    case "warning":
      return (
        <AlertTriangle
          className="size-4 shrink-0 text-amber-400 transition-transform duration-200"
          aria-hidden
        />
      );
    case "info":
    default:
      return (
        <Info
          className="size-4 shrink-0 text-sky-400 transition-transform duration-200"
          aria-hidden
        />
      );
  }
}

/**
 * Individual toast item rendered as a MailPilot squircle status plate
 * paired with a standalone circular dismiss button.
 * Supports inward convergence motion (`mp-flyout-retract`) on exit,
 * along with interactive action/undo chips.
 */
export function TactileToastItem({
  toast,
  onDismiss,
  onAnimationEnd,
  style,
  className,
  showDismissButton = true,
  centerLabel = false,
  animateIn = true,
}: TactileToastItemProps) {
  const isExiting = toast.phase === "out";
  const isEntering = toast.phase === "in";
  const action = toast.action;
  const cancel = toast.cancel;

  return (
    <div
      role="status"
      data-toast-id={String(toast.id)}
      data-toast-phase={toast.phase}
      onAnimationEnd={(event) => onAnimationEnd?.(toast.id, event)}
      className={cn(
        "relative flex h-11 w-full min-w-0 max-w-[min(85vw,480px)] origin-center items-center overflow-visible",
        animateIn && isEntering && "mp-flyout-pop",
        !animateIn && isEntering && "mp-toast-dock",
        isExiting && "mp-toast-exit",
        className
      )}
      style={style}
    >
      {/* Upper-left compact dismiss button matching MailPilot UI (#282c30) */}
      {showDismissButton ? (
        <button
          type="button"
          aria-label="Close notification"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="absolute -left-0.5 -top-0.5 z-40 flex size-3.5 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-[#282c30] text-[#e4f7f3]/75 shadow-sm transition-colors hover:bg-[#353a40] hover:text-[#e4f7f3] active:bg-[hsl(var(--sidebar-highlight))] before:absolute before:-inset-2 before:content-['']"
        >
          <X className="pointer-events-none size-2" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}

      {/* Main squircle toast pill */}
      <div
        className={cn(
          BULK_FLYOUT_PILL_CLASSNAME,
          "flex h-11 w-full min-w-0 items-center gap-2 px-3 text-[13px] font-medium tracking-normal text-[#e4f7f3]",
          centerLabel && "justify-center"
        )}
      >
        <div className="flex shrink-0 items-center">
          <ToastTypeIcon type={toast.type} customIcon={toast.icon} />
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-col justify-center leading-tight",
            centerLabel ? "items-center text-center" : "flex-1"
          )}
        >
          <span className="truncate whitespace-nowrap text-[#e4f7f3]">
            {toast.title}
          </span>
          {toast.description ? (
            <span className="truncate text-[11px] font-normal text-[#e4f7f3]/65">
              {toast.description}
            </span>
          ) : null}
        </div>

        {/* Optional Action Chip (e.g. Undo, Retry, View) */}
        {action ? (
          <div className="flex shrink-0 items-center">
            <BulkActionSeparator />
            {isValidElement(action) ? (
              action
            ) : isSonnerAction(action) ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  action.onClick?.(e);
                  onDismiss(toast.id);
                }}
                className={cn(
                  BULK_ACTION_BTN_CLASSNAME,
                  "h-7 rounded-lg px-2 text-xs font-semibold text-[#1ab5af] hover:text-[#e4f7f3]"
                )}
              >
                {action.label}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Optional Secondary Cancel Action */}
        {cancel ? (
          <div className="flex shrink-0 items-center">
            <BulkActionSeparator />
            {isValidElement(cancel) ? (
              cancel
            ) : isSonnerAction(cancel) ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  cancel.onClick?.(e);
                  onDismiss(toast.id);
                }}
                className={cn(
                  BULK_ACTION_BTN_CLASSNAME,
                  "h-7 rounded-lg px-2 text-xs font-semibold text-[#fb7185] hover:text-[#fb7185]"
                )}
              >
                {cancel.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
