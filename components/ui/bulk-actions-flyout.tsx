"use client";

import {
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

import { CancelTaskButton } from "@/components/ui/cancel-task-button";
import { TabCountBadge } from "@/components/ui/segmented-tabs";
import { APP_CONTENT_CENTER_X_CLASS } from "@/lib/app-content-center";
import { cn } from "@/lib/utils";

/** Tiny dot separator between flyout action chips. */
export function BulkActionDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-[2px] w-[2px] shrink-0 rounded-full bg-[hsl(var(--sidebar-foreground))]/45",
        className
      )}
    />
  );
}

/** Default (non-destructive) action chip — sidebar-nav inactive ink. */
export const BULK_ACTION_BTN_CLASSNAME =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-[hsl(var(--sidebar-foreground))]/65 transition-colors hover:bg-white/10 hover:text-[hsl(var(--sidebar-foreground))] disabled:opacity-50";

/** Alias — neutral flyout chip (non-tinted actions). */
export const BULK_ACTION_PLAIN_BTN_CLASSNAME = BULK_ACTION_BTN_CLASSNAME;

/** Destructive action chip — same red family as Delete Emails. */
export const BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME =
  "group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-[#fb7185] transition-colors hover:bg-[#C21E11]/15 hover:text-[#C21E11] disabled:opacity-50";

/** Default count pill on the dark sidebar flyout. */
export const BULK_ACTION_COUNT_CLASSNAME =
  "bg-white/15 text-[hsl(var(--sidebar-foreground))]/90 group-data-[state=active]:bg-white/15 group-data-[state=active]:text-[hsl(var(--sidebar-foreground))]";

/** Count pill tint matching destructive flyout text. */
export const BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME =
  "bg-[#fb7185]/20 text-[#fb7185] group-hover:bg-[#C21E11]/20 group-hover:text-[#C21E11] group-data-[state=active]:bg-[#fb7185]/20 group-data-[state=active]:text-[#fb7185]";

/** Dismiss chip — #C21E11 label before hover. */
export const BULK_ACTION_DISMISS_BTN_CLASSNAME =
  "group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-[#C21E11] transition-colors hover:bg-[#C21E11]/15 hover:text-[#C21E11] disabled:opacity-50";

/** Count pill matching the Dismiss label. */
export const BULK_ACTION_COUNT_DISMISS_CLASSNAME =
  "bg-[#C21E11]/20 text-[#C21E11] group-data-[state=active]:bg-[#C21E11]/20 group-data-[state=active]:text-[#C21E11]";

/** Count pill for flyout action labels — sidebar-flyout chrome by default. */
export function BulkActionCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <TabCountBadge
      count={count}
      className={cn(BULK_ACTION_COUNT_CLASSNAME, className)}
    />
  );
}

const BULK_FLYOUT_PILL_CLASSNAME =
  "flex h-11 min-w-0 shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto rounded-full border border-[hsl(var(--sidebar))] bg-[hsl(var(--sidebar))] px-4 text-[hsl(var(--sidebar-foreground))] shadow-md";

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
        "flex shrink-0 flex-nowrap items-center gap-1.5",
        className
      )}
    >
      <span
        className="inline-flex shrink-0 items-center px-1.5 text-xs font-semibold text-[hsl(var(--sidebar-foreground))]/65"
        aria-label={labelText}
      >
        {label}
      </span>
      <span
        aria-hidden
        className="mx-1 h-4 w-px shrink-0 bg-[hsl(var(--sidebar-foreground))]/20"
      />
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
  className?: string;
  /** Accessible region label. */
  label?: string;
};

type FlyoutPhase = "prep" | "in" | "idle" | "out";

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
  className,
  label = "Bulk actions toolbar",
}: BulkActionsFlyoutProps) {
  const cancelPendingRef = useRef(false);
  const { mounted, phase, style, onAnimationEnd } = useFlyoutPresence(
    selectedCount > 0
  );

  useEffect(() => {
    if (selectedCount > 0) cancelPendingRef.current = false;
  }, [selectedCount]);

  if (!mounted) return null;

  return (
    <div
      role="region"
      aria-label={label}
      data-bulk-actions
      data-dnd-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        APP_CONTENT_CENTER_X_CLASS,
        "fixed bottom-[calc(1.5rem+var(--app-mobile-bottom-inset,0px))] z-40 w-max max-w-[min(96vw,calc(100vw-var(--app-sidebar-width,0px)-1.5rem))] -translate-x-1/2 md:bottom-2",
        className
      )}
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
          {children}
        </div>

        {trailing ? (
          <div className={cn("mp-flyout-chunk", BULK_FLYOUT_PILL_CLASSNAME)}>
            {trailing}
          </div>
        ) : null}

        <div className="mp-flyout-chunk shrink-0">
          <CancelTaskButton
            onCancel={() => {
              if (cancelPendingRef.current) return;
              cancelPendingRef.current = true;
              onCancel();
            }}
            title="Clear selection"
            // Full turn before pills meet; hold through the rest of converge.
            spinMs={600}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--sidebar))] bg-[hsl(var(--sidebar))] p-0 text-[hsl(var(--sidebar-foreground))]/65 shadow-md hover:bg-[hsl(var(--sidebar))] hover:text-[#C21E11] [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-current"
          />
        </div>
      </div>
    </div>
  );
}
