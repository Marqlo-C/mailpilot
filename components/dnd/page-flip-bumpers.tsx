"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { DND_PAGE_EDGE_PX } from "@/lib/dnd/constants";
import { cn } from "@/lib/utils";

/** Same ghost circle as searchbar trailing actions (clear / mic / filters). */
const BUMPER_ICON_CLASS =
  "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none";
const BUMPER_ICON_ARMED_CLASS =
  "bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]";

/**
 * Page-flip edge buttons while dragging. Placed only inside the content well:
 * below the mobile top bar (`4.25rem`; flush on desktop, where that bar is in the sidebar), right of the sidebar (`--app-sidebar-width`),
 * above the mobile bottom nav (`--app-mobile-bottom-inset`), and inset from
 * the viewport’s right edge by the flip band width. Armed state is the button
 * fill — no edge glow.
 */
export function PageFlipBumpers({
  active,
  pageFlipDir,
  currentPage,
  totalPages,
  dropZone = null,
}: {
  active: boolean;
  pageFlipDir: -1 | 1 | null;
  currentPage: number;
  totalPages: number;
  dropZone?: string | null;
}) {
  if (!active || totalPages <= 1 || dropZone) return null;

  const showLeft = currentPage > 1;
  const showRight = currentPage < totalPages;
  if (!showLeft && !showRight) return null;

  return (
    <div
      className="pointer-events-none fixed top-[4.25rem] z-[70] md:top-0"
      style={{
        left: "var(--app-sidebar-width, 0px)",
        right: 0,
        bottom: "var(--app-mobile-bottom-inset, 0px)",
      }}
      aria-hidden
    >
      {showLeft ? (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-center"
          style={{ width: DND_PAGE_EDGE_PX }}
        >
          <span
            className={cn(
              BUMPER_ICON_CLASS,
              pageFlipDir === -1 && BUMPER_ICON_ARMED_CLASS
            )}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </span>
        </div>
      ) : null}

      {showRight ? (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center"
          style={{ width: DND_PAGE_EDGE_PX }}
        >
          <span
            className={cn(
              BUMPER_ICON_CLASS,
              pageFlipDir === 1 && BUMPER_ICON_ARMED_CLASS
            )}
          >
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
      ) : null}
    </div>
  );
}
