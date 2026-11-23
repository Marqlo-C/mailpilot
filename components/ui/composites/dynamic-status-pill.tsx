"use client";

import {
  isValidElement,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

import { ClassifyingFlyoutStatus } from "@/components/layout/classifying-flyout-status";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_FLYOUT_PILL_CLASSNAME,
  BulkActionSeparator,
} from "@/components/ui/composites/bulk-actions-flyout";
import {
  useDynamicStatusSlot,
  type DynamicStatusSlotState,
} from "@/hooks/use-dynamic-status-slot";
import type {
  TactileToastRecord,
  TactileToastType,
} from "@/hooks/use-tactile-toasts";
import { cn } from "@/lib/utils";

export interface DynamicStatusPillProps {
  className?: string;
  slotState?: DynamicStatusSlotState;
  linger?: boolean;
}

function isSonnerAction(
  val: unknown
): val is { label: ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void } {
  return typeof val === "object" && val !== null && "label" in val;
}

function DynamicToastIcon({
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
 * Unified Tactile Status Pill that houses both persistent background sync telemetry
 * (Track A) and transient notifications (Track B) in a two-track vertical roll carousel.
 */
export function DynamicStatusPill({
  className,
  slotState,
  linger = false,
}: DynamicStatusPillProps) {
  const internalSlot = useDynamicStatusSlot();
  const slot = slotState ?? internalSlot;

  const {
    showSync,
    showToast,
    activeToast,
    dismissActiveToast,
    pauseHover,
    resumeHover,
    hasActiveContent,
  } = slot;

  // Latch toast reference so track does not flash empty during 300ms roll-out
  const [lastToast, setLastToast] = useState<TactileToastRecord | null>(
    activeToast
  );
  if (activeToast && activeToast !== lastToast) {
    setLastToast(activeToast);
  }

  const displayedToast = activeToast ?? lastToast;

  if (!hasActiveContent && !linger) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={pauseHover}
      onMouseLeave={resumeHover}
      className={cn(
        BULK_FLYOUT_PILL_CLASSNAME,
        "px-3",
        className
      )}
    >
      <div className="relative flex h-5 min-w-0 items-center overflow-hidden transition-[width] duration-200">
        {/* Track A: Sync Telemetry View */}
        <div
          data-testid="status-track-sync"
          className={cn(
            "flex items-center gap-2 transition-all duration-300 ease-out whitespace-nowrap",
            showSync
              ? "translate-y-0 opacity-100"
              : "pointer-events-none absolute inset-0 -translate-y-full opacity-0"
          )}
        >
          <ClassifyingFlyoutStatus linger={linger} className="px-0" />
        </div>

        {/* Track B: Toast Notification View */}
        <div
          data-testid="status-track-toast"
          className={cn(
            "flex items-center gap-2 transition-all duration-300 ease-out whitespace-nowrap",
            showToast
              ? "translate-y-0 opacity-100"
              : "pointer-events-none absolute inset-0 translate-y-full opacity-0"
          )}
        >
          {displayedToast ? (
            <>
              <div className="flex shrink-0 items-center">
                <DynamicToastIcon
                  type={displayedToast.type}
                  customIcon={displayedToast.icon}
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
                <span className="truncate whitespace-nowrap text-[13px] font-medium text-[#e4f7f3]">
                  {displayedToast.title}
                </span>
                {displayedToast.description ? (
                  <span className="truncate text-[11px] font-normal text-[#e4f7f3]/65">
                    {displayedToast.description}
                  </span>
                ) : null}
              </div>

              {/* Action Chip */}
              {displayedToast.action ? (
                <div className="flex shrink-0 items-center">
                  <BulkActionSeparator />
                  {isValidElement(displayedToast.action) ? (
                    displayedToast.action
                  ) : isSonnerAction(displayedToast.action) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isSonnerAction(displayedToast.action)) {
                          displayedToast.action.onClick?.(e);
                        }
                        dismissActiveToast();
                      }}
                      className={cn(
                        BULK_ACTION_BTN_CLASSNAME,
                        "h-6 rounded-md px-2 text-xs font-semibold text-[#1ab5af] hover:text-[#e4f7f3]"
                      )}
                    >
                      {displayedToast.action.label}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* Inline Micro-dismiss Button */}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dismissActiveToast();
                  }}
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
