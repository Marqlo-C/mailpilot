"use client";

import {
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

import { TactileToastItem } from "@/components/ui/composites/tactile-toast-item";
import {
  useTactileToasts,
  type TactileToastRecord,
} from "@/hooks/use-tactile-toasts";
import { cn } from "@/lib/utils";

export interface TactileToastStackProps {
  toasts?: TactileToastRecord[];
  onDismiss?: (id: string | number) => void;
  onCompleteExit?: (id: string | number) => void;
  onPause?: () => void;
  onResume?: () => void;
  maxVisible?: number;
  className?: string;
  underlay?: ReactNode;
}

/**
 * Renders independent toast cards stacked in 3D card depth.
 * Uses a single-cell CSS Grid so the stack container dynamically matches
 * the natural maximum width of its content (front toasts + background sync).
 * Background cards are scaled down and locked to `w-full` so they never
 * overflow horizontally or stick out awkwardly past the front card.
 */
export function TactileToastStack({
  toasts: propToasts,
  onDismiss: propDismiss,
  onCompleteExit: propCompleteExit,
  onPause: propPause,
  onResume: propResume,
  maxVisible = 3,
  className,
  underlay,
}: TactileToastStackProps) {
  const toastHook = useTactileToasts();
  const toasts = propToasts ?? toastHook.toasts;
  const dismissToast = propDismiss ?? toastHook.dismissToast;
  const completeExit = propCompleteExit ?? toastHook.completeExit;
  const pauseAll = propPause ?? toastHook.pauseAll;
  const resumeAll = propResume ?? toastHook.resumeAll;

  function handleAnimationEnd(
    id: string | number,
    event: AnimationEvent<HTMLDivElement>
  ) {
    if (event.target !== event.currentTarget) return;
    if (
      event.animationName.includes("mp-toast-exit") ||
      event.animationName.includes("mp-flyout-retract")
    ) {
      completeExit(id);
    }
  }

  const visibleToasts = toasts.slice(0, maxVisible);
  const hasToasts = visibleToasts.length > 0;

  if (!hasToasts && !underlay) {
    return null;
  }

  // Underlay styling based on whether toasts sit in front
  const underlayStyle: CSSProperties = !hasToasts
    ? {
        zIndex: 1,
        transform: "scale(1) translateY(0)",
        opacity: 1,
        transition: "transform 250ms ease-out, opacity 250ms ease-out",
      }
    : {
        zIndex: 5,
        transform:
          visibleToasts.length === 1
            ? "scale(0.95) translateY(-8px)"
            : "scale(0.90) translateY(-16px)",
        opacity: visibleToasts.length === 1 ? 0.85 : 0.5,
        pointerEvents: "none",
        transformOrigin: "bottom center",
        transition: "transform 250ms ease-out, opacity 250ms ease-out",
      };

  return (
    <div
      role="region"
      aria-label="Notification stack"
      data-dnd-ignore
      onMouseEnter={pauseAll}
      onMouseLeave={resumeAll}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "relative grid grid-cols-1 grid-rows-1 items-center justify-items-stretch w-max min-w-0 transition-[width] duration-200",
        className
      )}
    >
      {/* Background underlay (e.g. Sync status card) */}
      {underlay ? (
        <div
          style={underlayStyle}
          className={cn(
            "col-start-1 row-start-1 flex h-11 w-full min-w-0 max-w-full items-center overflow-hidden rounded-2xl",
            hasToasts && "select-none pointer-events-none"
          )}
        >
          {underlay}
        </div>
      ) : null}

      {/* Stacked Toast Cards */}
      {visibleToasts.map((item, index) => {
        const isFront = index === 0;
        const depthScale = isFront ? 1 : index === 1 ? 0.95 : 0.9;
        const depthY = isFront ? 0 : index === 1 ? -8 : -16;
        const depthOpacity = isFront ? 1 : index === 1 ? 0.85 : 0.5;
        const zIndex = 30 - index * 10;

        const stackStyle: CSSProperties = {
          zIndex,
          transform: `scale(${depthScale}) translateY(${depthY}px)`,
          opacity: depthOpacity,
          pointerEvents: isFront ? "auto" : "none",
          transformOrigin: "bottom center",
          transition: "transform 250ms ease-out, opacity 250ms ease-out",
        };

        return (
          <div
            key={item.id}
            style={stackStyle}
            className={cn(
              "col-start-1 row-start-1 flex h-11 w-full min-w-0 max-w-full items-center rounded-2xl",
              isFront ? "overflow-visible" : "overflow-hidden"
            )}
          >
            <TactileToastItem
              toast={item}
              showDismissButton={isFront}
              centerLabel={true}
              animateIn={false}
              onDismiss={dismissToast}
              onAnimationEnd={handleAnimationEnd}
              className="h-11 w-full"
            />
          </div>
        );
      })}
    </div>
  );
}
