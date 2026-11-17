"use client";

import { useEffect, useState, type AnimationEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { TactileToastItem } from "@/components/ui/composites/tactile-toast-item";
import { useTactileToasts } from "@/hooks/use-tactile-toasts";
import { APP_CONTENT_CENTER_X_CLASS } from "@/lib/utils/layout";
import { cn } from "@/lib/utils";

export interface TactileToastDeckProps {
  /**
   * Whether the bottom bar (e.g., BulkActionsFlyout or GlobalSyncTracker)
   * is active, requiring toasts to elevate into the upper tier (~4rem elevation).
   */
  isElevated?: boolean;
  className?: string;
  maxVisible?: number;
}

/**
 * Centered bottom toast deck that coordinates elevation with MailPilot's
 * bulk actions bar, pauses timers on hover, and stacks multiple notifications in 3D depth.
 */
export function TactileToastDeck({
  isElevated = false,
  className,
  maxVisible = 3,
}: TactileToastDeckProps) {
  const [mounted, setMounted] = useState(false);
  const { toasts, dismissToast, completeExit, pauseAll, resumeAll } = useTactileToasts();

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleAnimationEnd(
    id: string | number,
    event: AnimationEvent<HTMLDivElement>
  ) {
    if (event.target !== event.currentTarget) return;
    if (event.animationName.includes("mp-flyout-retract")) {
      completeExit(id);
    }
  }

  if (!mounted || typeof document === "undefined" || toasts.length === 0) {
    return null;
  }

  // Slice up to maxVisible active notifications (default 3)
  const visibleToasts = toasts.slice(0, maxVisible);

  return createPortal(
    <aside
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      data-dnd-ignore
      onMouseEnter={pauseAll}
      onMouseLeave={resumeAll}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        APP_CONTENT_CENTER_X_CLASS,
        "fixed z-50 w-max max-w-[min(96vw,calc(100vw-var(--app-sidebar-width,0px)-1.5rem))] -translate-x-1/2 transition-[bottom,transform] duration-300 ease-out",
        isElevated
          ? "bottom-[calc(44px+1.5rem+var(--app-mobile-bottom-inset,0px)+0.5rem)] md:bottom-[calc(44px+1.25rem)]"
          : "bottom-[calc(1.5rem+var(--app-mobile-bottom-inset,0px))] md:bottom-2",
        className
      )}
    >
      <div className="relative flex flex-col items-center">
        {visibleToasts.map((item, index) => {
          const isFront = index === 0;
          const depthScale = isFront ? 1 : index === 1 ? 0.95 : 0.9;
          const depthY = isFront ? 0 : index === 1 ? -8 : -16;
          const depthOpacity = isFront ? 1 : index === 1 ? 0.85 : 0.5;
          const zIndex = 30 - index * 10;

          const stackStyle: CSSProperties = isFront
            ? {
                zIndex,
                transform: `scale(${depthScale}) translateY(${depthY}px)`,
                opacity: depthOpacity,
                transition: "transform 250ms ease-out, opacity 250ms ease-out",
              }
            : {
                position: "absolute",
                bottom: 0,
                zIndex,
                transform: `scale(${depthScale}) translateY(${depthY}px)`,
                opacity: depthOpacity,
                pointerEvents: "none",
                transformOrigin: "bottom center",
                transition: "transform 250ms ease-out, opacity 250ms ease-out",
              };

          return (
            <TactileToastItem
              key={item.id}
              toast={item}
              style={stackStyle}
              onDismiss={dismissToast}
              onAnimationEnd={handleAnimationEnd}
            />
          );
        })}
      </div>
    </aside>,
    document.body
  );
}
