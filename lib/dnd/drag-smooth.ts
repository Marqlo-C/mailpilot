import {
  DND_DEADZONE_BOTTOM_RATIO,
  DND_DEADZONE_TOP_RATIO,
} from "@/lib/dnd/constants";
import {
  captureReorderRects,
  contiguousMovedRunIds,
  type FrozenItemRect,
} from "@/lib/dnd/interactive";

/** Grab-relative geometry for deadzone drag of a single card or multi-select union. */
export type DragGrabGeometry = {
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  startLeft: number;
  startTop: number;
  topThreshold: number;
  bottomThreshold: number;
};

function unionRects(
  rects: Iterable<FrozenItemRect>
): { left: number; top: number; right: number; bottom: number } | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let found = false;
  for (const rect of rects) {
    found = true;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!found) return null;
  return { left, top, right, bottom };
}

/**
 * Grab bbox for deadzone/lerp: contiguous selected run containing the origin
 * (the card under the pointer). Distant selected clusters are ignored so the
 * ghost stays glued to the grab — live preview still moves all selected ids.
 */
export function captureDragGrabGeometry(
  movedIds: readonly string[],
  clientX: number,
  clientY: number,
  rects?: Map<string, FrozenItemRect> | null,
  originId?: string,
  fullIds?: readonly string[]
): DragGrabGeometry | null {
  if (movedIds.length === 0) return null;

  const map = rects ?? captureReorderRects(movedIds);
  const runIds =
    fullIds && fullIds.length > 0
      ? contiguousMovedRunIds(fullIds, movedIds, originId)
      : originId && map.has(originId)
        ? [originId]
        : [...movedIds];

  const runRects: FrozenItemRect[] = [];
  for (const id of runIds) {
    const rect = map.get(id);
    if (rect) runRects.push(rect);
  }

  let bounds = unionRects(runRects);
  if (!bounds && originId) {
    const origin = map.get(originId);
    if (origin) {
      bounds = {
        left: origin.left,
        top: origin.top,
        right: origin.right,
        bottom: origin.bottom,
      };
    }
  }
  if (!bounds) {
    bounds = unionRects(
      movedIds
        .map((id) => map.get(id))
        .filter((r): r is FrozenItemRect => Boolean(r))
    );
  }
  if (!bounds) return null;

  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const topThreshold = DND_DEADZONE_TOP_RATIO * height;
  const bottomThreshold = DND_DEADZONE_BOTTOM_RATIO * height;

  const rawGrabX = clientX - bounds.left;
  const rawGrabY = clientY - bounds.top;
  const grabX = Math.min(width, Math.max(0, rawGrabX));
  const grabY = Math.min(height, Math.max(0, rawGrabY));

  return {
    grabX,
    grabY,
    width,
    height,
    startLeft: bounds.left,
    startTop: bounds.top,
    topThreshold,
    bottomThreshold,
  };
}

/**
 * Deadzone target for the dragged representation’s top-left.
 * Vertical free zone is the middle 20% of height; X follows grab offset directly.
 */
export function computeDeadzoneTarget(
  clientX: number,
  clientY: number,
  currentTop: number,
  grab: DragGrabGeometry
): { targetX: number; targetY: number } {
  const targetX = clientX - grab.grabX;
  const relativeY = clientY - currentTop;

  if (relativeY < grab.topThreshold) {
    return { targetX, targetY: clientY - grab.topThreshold };
  }
  if (relativeY > grab.bottomThreshold) {
    return { targetX, targetY: clientY - grab.bottomThreshold };
  }
  // Free zone — hold vertical target at the current element top.
  return { targetX, targetY: currentTop };
}
