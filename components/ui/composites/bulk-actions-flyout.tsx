"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TabCountBadge,
  darkPlateClassName,
} from "@/components/ui/tactile/segmented-tabs";
import { CurvedVerticalDivider } from "@/components/ui/tactile/nested-settings-card";
import { APP_CONTENT_CENTER_X_CLASS } from "@/lib/app-content-center";
import { cn } from "@/lib/utils";

/**
 * Straight mid-pill rule between action chips — same length as
 * {@link ToolbarDivider} after Select all (`h-4`), quiet like sidebar hairlines.
 */
export function BulkActionSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("mx-1 h-4 w-px shrink-0 bg-white/10", className)}
    />
  );
}

/** @deprecated Prefer {@link BulkActionSeparator}. */
export function BulkActionDot(props: { className?: string }) {
  return <BulkActionSeparator {...props} />;
}

/** Default action chip — same type + hover/active as sidebar rows. */
export const BULK_ACTION_BTN_CLASSNAME =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60 transition-colors duration-150 hover:bg-white/10 hover:text-[#e4f7f3] active:bg-[hsl(var(--sidebar-highlight))] active:text-[#e4f7f3] disabled:opacity-50";

/** Alias — neutral flyout chip (non-tinted actions). */
export const BULK_ACTION_PLAIN_BTN_CLASSNAME = BULK_ACTION_BTN_CLASSNAME;

/** Destructive action chip — same red family as Delete Emails. */
export const BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME =
  "group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium tracking-normal text-[#fb7185] transition-colors duration-150 hover:bg-[#C21E11]/15 hover:text-[#C21E11] active:bg-[#C21E11]/20 disabled:opacity-50";

/** Same chip as tab-rail / sidebar count pills. */
export const BULK_ACTION_COUNT_CLASSNAME = "";

/** Count pill tint matching destructive flyout text — same size as tab chips. */
export const BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME =
  "rounded-md border border-[#fb7185]/55 bg-[#fb7185]/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#fb7185] group-hover:border-[#C21E11]/55 group-hover:bg-[#C21E11]/15 group-hover:text-[#C21E11] group-data-[state=active]:border-[#fb7185]/55 group-data-[state=active]:bg-[#fb7185]/15 group-data-[state=active]:text-[#fb7185]";

/** Dismiss chip — #C21E11 label before hover. */
export const BULK_ACTION_DISMISS_BTN_CLASSNAME =
  "group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium tracking-normal text-[#C21E11] transition-colors duration-150 hover:bg-[#C21E11]/15 hover:text-[#C21E11] active:bg-[#C21E11]/20 disabled:opacity-50";

/** Count pill matching the Dismiss/Delete label — hairline outline, tab-chip size. */
export const BULK_ACTION_COUNT_DISMISS_CLASSNAME =
  "rounded-md border border-white/10 bg-[#C21E11]/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#C21E11] group-data-[state=active]:border-white/10 group-data-[state=active]:bg-[#C21E11]/15 group-data-[state=active]:text-[#C21E11]";

/** Same plate + density as SidebarFlyout; width hugs the longest option. */
const BULK_CANCEL_MENU_CONTENT_CLASS = cn(
  "z-[160] flex w-max min-w-0 flex-col gap-1 rounded-2xl p-1.5 text-[#e4f7f3]",
  darkPlateClassName
);

const BULK_CANCEL_MENU_ITEM_CLASS =
  "flex h-9 cursor-pointer items-center rounded-xl px-3 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60 transition-colors duration-150 focus:bg-white/10 focus:text-[#e4f7f3] data-[highlighted]:bg-white/10 data-[highlighted]:text-[#e4f7f3]";

/** Count pill for flyout action labels — same style as tab/sidebar counts. */
export function BulkActionCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return <TabCountBadge count={count} className={className} />;
}

/**
 * Squircle action/status shell — sidebar-panel plate, rounded-2xl.
 * Cancel/X stays circular via {@link BULK_FLYOUT_CANCEL_CLASSNAME}.
 */
export const BULK_FLYOUT_PILL_CLASSNAME = cn(
  "flex h-11 min-w-0 shrink-0 flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl px-1.5 text-[#e4f7f3]",
  darkPlateClassName
);

/**
 * Circular clear/cancel — opaque sidebar plate (hover uses highlight, not
 * translucent white/10 which made the control look clear).
 */
export const BULK_FLYOUT_CANCEL_CLASSNAME =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[hsl(var(--sidebar-panel))] p-0 text-[#e4f7f3]/65 shadow-md transition-colors duration-150 hover:bg-[hsl(var(--sidebar-highlight))] hover:text-[#C21E11] active:bg-[hsl(var(--sidebar-highlight))] disabled:opacity-60 [&_svg]:size-4 [&_svg]:text-current";

/** Fixed bottom host for selection / classifying flyouts. */
export const BULK_FLYOUT_HOST_CLASSNAME = cn(
  APP_CONTENT_CENTER_X_CLASS,
  "fixed bottom-[calc(1.5rem+var(--app-mobile-bottom-inset,0px))] z-40 w-max max-w-[min(96vw,calc(100vw-var(--app-sidebar-width,0px)-1.5rem))] -translate-x-1/2 md:bottom-2"
);

/** Labeled action cluster inside the flyout (e.g. Snapshot icon → Create / Delete). */
export function BulkActionSection({
  label,
  children,
  className,
  /** Accessible name when `label` is an icon. */
  labelText,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  labelText?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-nowrap items-center gap-1",
        className
      )}
    >
      <span
        className="inline-flex shrink-0 items-center px-1.5 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60"
        aria-label={labelText}
      >
        {label}
      </span>
      {/* Same silhouette as this pill’s left outer edge (h-11 / rounded-2xl). */}
      <CurvedVerticalDivider className="-mx-0.5" height={44} radius={16} />
      {children}
    </div>
  );
}

type BulkActionsFlyoutProps = {
  selectedCount: number;
  onCancel: () => void;
  children: ReactNode;
  /**
   * Optional second pill (e.g. Unsubscribe), separated from the main bar
   * the same way the clear control is.
   */
  trailing?: ReactNode;
  /**
   * Optional status cluster (e.g. classifying pill) after trailing /
   * Unsubscribe so sync status shares the bar without a second flyout.
   * Owns its own chrome — not wrapped in the action pill shell.
   */
  status?: ReactNode;
  /**
   * When sync is active alongside selection, the single X opens a choice
   * between clearing selection and stopping classification.
   */
  syncActive?: boolean;
  onStopSync?: () => void;
  /** Label for stopping the active sync (e.g. Stop reviewing / Stop sorting). */
  stopSyncLabel?: string;
  className?: string;
  /** Accessible region label. */
  label?: string;
};

type FlyoutPhase = "prep" | "in" | "idle" | "out";

type BulkActionsOpenContextValue = {
  /** Selection flyout mounted (including leave animation). */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** True as soon as selectedCount > 0 — sync tracker yields before bulk mounts. */
  selectionRequested: boolean;
  setSelectionRequested: (value: boolean) => void;
  /** Standalone sync flyout mounted (including leave animation). */
  syncTrackerMounted: boolean;
  setSyncTrackerMounted: (value: boolean) => void;
};

const BulkActionsOpenContext = createContext<BulkActionsOpenContextValue>({
  open: false,
  setOpen: () => {},
  selectionRequested: false,
  setSelectionRequested: () => {},
  syncTrackerMounted: false,
  setSyncTrackerMounted: () => {},
});

/** App-shell provider so GlobalSyncTracker can yield to the selection flyout. */
export function BulkActionsOpenProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectionRequested, setSelectionRequested] = useState(false);
  const [syncTrackerMounted, setSyncTrackerMounted] = useState(false);
  return (
    <BulkActionsOpenContext.Provider
      value={{
        open,
        setOpen,
        selectionRequested,
        setSelectionRequested,
        syncTrackerMounted,
        setSyncTrackerMounted,
      }}
    >
      {children}
    </BulkActionsOpenContext.Provider>
  );
}

/** True while the selection flyout is mounted (including leave animation). */
export function useBulkActionsOpen() {
  return useContext(BulkActionsOpenContext).open;
}

/** Shared handoff between standalone sync tracker and selection flyout. */
export function useBulkActionsHandoff() {
  return useContext(BulkActionsOpenContext);
}

/** Same enter/exit timing as the selection flyout. */
export function useFlyoutPresence(open: boolean) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<FlyoutPhase>("prep");
  const phaseRef = useRef<FlyoutPhase>("prep");
  const mountedRef = useRef(false);
  const openRef = useRef(open);
  phaseRef.current = phase;
  mountedRef.current = mounted;
  openRef.current = open;

  useEffect(() => {
    if (open) {
      // A leave already running must finish. Restarting here loops when the
      // sliding edge passes back under a cursor held just outside.
      if (
        mountedRef.current &&
        (phaseRef.current === "in" ||
          phaseRef.current === "idle" ||
          phaseRef.current === "out")
      ) {
        return;
      }
      setMounted(true);
      setPhase("prep");
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setPhase("idle");
        return;
      }
      const timer = window.setTimeout(() => {
        if (phaseRef.current === "prep") setPhase("in");
      }, 16);
      return () => window.clearTimeout(timer);
    }
    if (mountedRef.current && phaseRef.current !== "out") setPhase("out");
  }, [open]);

  function onAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const name = event.animationName;
    if (phaseRef.current === "in" && name.includes("mp-flyout-pop")) {
      setPhase("idle");
      return;
    }
    if (phaseRef.current === "out" && name.includes("mp-flyout-retract")) {
      if (openRef.current) {
        setPhase("prep");
        window.setTimeout(() => {
          if (phaseRef.current === "prep" && openRef.current) setPhase("in");
        }, 16);
        return;
      }
      setMounted(false);
      setPhase("prep");
    }
  }

  const style: CSSProperties | undefined =
    phase === "prep"
      ? { opacity: 0, transform: "scale(0.15) translateY(5px)" }
      : phase === "idle"
        ? { opacity: 1, transform: "scale(1) translateY(0)" }
        : undefined;

  return { mounted, phase, style, onAnimationEnd };
}

/**
 * Fixed bottom selection flyout (Job Radar / Subscriptions).
 * Outer shell keeps content-center `translateX(-50%)` stable; enter overshoots;
 * exit slides pills together then folds down.
 */
export function BulkActionsFlyout({
  selectedCount,
  onCancel,
  children,
  trailing,
  status,
  syncActive = false,
  onStopSync,
  stopSyncLabel = "Stop sorting",
  className,
  label = "Bulk actions toolbar",
}: BulkActionsFlyoutProps) {
  const cancelPendingRef = useRef(false);
  const {
    setOpen: setBulkOpen,
    setSelectionRequested,
    syncTrackerMounted,
  } = useBulkActionsHandoff();
  // Wait for the standalone sync flyout to finish leaving so both don't overlap.
  const { mounted, phase, style, onAnimationEnd } = useFlyoutPresence(
    selectedCount > 0 && !syncTrackerMounted
  );
  const chooseOnCancel = Boolean(syncActive && onStopSync);
  const stopLabel = stopSyncLabel.trim() || "Stop sorting";

  // Selection hits 0 on the same render that starts leave — phase is still
  // idle/in that frame, so gate on selectedCount (not phase) or we'd freeze
  // the already-collapsed Snapshot / Delete / counts chrome.
  const lingerRef = useRef({
    children,
    trailing,
    status,
    chooseOnCancel,
    stopLabel,
  });
  if (selectedCount > 0) {
    lingerRef.current = {
      children,
      trailing,
      status,
      chooseOnCancel,
      stopLabel,
    };
  }
  const shown = lingerRef.current;

  useEffect(() => {
    if (selectedCount > 0) cancelPendingRef.current = false;
  }, [selectedCount]);

  useEffect(() => {
    setSelectionRequested(selectedCount > 0);
    return () => setSelectionRequested(false);
  }, [selectedCount, setSelectionRequested]);

  useEffect(() => {
    setBulkOpen(mounted);
    return () => setBulkOpen(false);
  }, [mounted, setBulkOpen]);

  function clearSelection() {
    if (cancelPendingRef.current) return;
    cancelPendingRef.current = true;
    onCancel();
  }

  if (!mounted || typeof document === "undefined") return null;

  // Portaled so the scroll-column fades (z-25, outside the scroller) cannot
  // paint over this bar. In-flow `fixed` stays trapped under that sibling.
  return createPortal(
    <div
      role="region"
      aria-label={label}
      data-bulk-actions
      data-dnd-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={cn(BULK_FLYOUT_HOST_CLASSNAME, className)}
    >
      <div
        className={cn(
          "flex origin-center flex-nowrap items-center gap-2.5",
          phase === "in" && "mp-flyout-pop",
          phase === "out" && "mp-flyout-retract"
        )}
        style={style}
        onAnimationEnd={onAnimationEnd}
      >
        <div className={cn("mp-flyout-chunk", BULK_FLYOUT_PILL_CLASSNAME)}>
          {shown.children}
        </div>

        {shown.trailing ? (
          <div className={cn("mp-flyout-chunk", BULK_FLYOUT_PILL_CLASSNAME)}>
            {shown.trailing}
          </div>
        ) : null}

        {shown.status ? (
          <div className="mp-flyout-chunk shrink-0">{shown.status}</div>
        ) : null}

        <div className="mp-flyout-chunk shrink-0">
          {shown.chooseOnCancel ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={`Clear selection or ${shown.stopLabel.toLowerCase()}`}
                  aria-label={`Clear selection or ${shown.stopLabel.toLowerCase()}`}
                  className={BULK_FLYOUT_CANCEL_CLASSNAME}
                >
                  <X className="size-4 text-current" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                side="top"
                sideOffset={8}
                className={BULK_CANCEL_MENU_CONTENT_CLASS}
              >
                <DropdownMenuItem
                  className={BULK_CANCEL_MENU_ITEM_CLASS}
                  onSelect={() => clearSelection()}
                >
                  Clear selection
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={BULK_CANCEL_MENU_ITEM_CLASS}
                  onSelect={() => onStopSync?.()}
                >
                  {shown.stopLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <CancelTaskButton
              onCancel={clearSelection}
              title="Clear selection"
              // Full turn before pills meet; hold through the rest of converge.
              spinMs={600}
              className={BULK_FLYOUT_CANCEL_CLASSNAME}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
