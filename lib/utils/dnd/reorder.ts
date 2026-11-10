/**
 * Move `movedIds` (preserving their relative order) so the block starts at
 * `targetIndex` in the list that remains after removal.
 * `targetIndex` is an index into the without-moved list (0…without.length).
 */
export function reorderIds(
  fullIds: string[],
  movedIds: string[],
  targetIndex: number
): string[] {
  const movedSet = new Set(movedIds);
  const moving = fullIds.filter((id) => movedSet.has(id));
  if (moving.length === 0) return fullIds;

  const without = fullIds.filter((id) => !movedSet.has(id));
  const clamped = Math.max(0, Math.min(targetIndex, without.length));
  return [
    ...without.slice(0, clamped),
    ...moving,
    ...without.slice(clamped),
  ];
}

/**
 * Convert an absolute index in `fullIds` into a without-moved insert index
 * (same space `reorderIds` expects).
 */
export function adjustInsertIndexForMoved(
  fullIds: string[],
  movedIds: string[],
  absoluteIndex: number
): number {
  const movedSet = new Set(movedIds);
  let adjusted = absoluteIndex;
  for (let i = 0; i < absoluteIndex && i < fullIds.length; i++) {
    if (movedSet.has(fullIds[i]!)) adjusted -= 1;
  }
  return Math.max(0, adjusted);
}

/**
 * Live reorder preview while dragging. `insertIndex` is without-moved space.
 * Returns null when there is nothing to preview.
 */
export function previewReorderFullIds(
  fullIds: string[],
  movedIds: string[],
  insertIndex: number | null
): string[] | null {
  if (insertIndex == null || movedIds.length === 0 || fullIds.length === 0) {
    return null;
  }
  return reorderIds(fullIds, movedIds, insertIndex);
}

/** Stable reorder of records to match an id list (unknown ids append). */
export function orderItemsByIds<T extends { id: string }>(
  items: T[],
  ids: string[]
): T[] {
  if (ids.length === 0 || items.length <= 1) return items;
  const map = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of ids) {
    const item = map.get(id);
    if (!item) continue;
    result.push(item);
    map.delete(id);
  }
  for (const item of items) {
    if (map.has(item.id)) result.push(item);
  }
  return result;
}

/**
 * Merge a reordered filtered id list back into a broader saved custom order,
 * keeping ids that are not in the current filter in their prior relative spots.
 */
export function mergeFilteredOrderIntoCustom(
  previousCustom: string[],
  filteredIds: string[],
  nextFilteredIds: string[]
): string[] {
  const filteredSet = new Set(filteredIds);
  if (previousCustom.length === 0) {
    return nextFilteredIds;
  }

  const nextQueue = [...nextFilteredIds];
  const result: string[] = [];

  for (const id of previousCustom) {
    if (!filteredSet.has(id)) {
      result.push(id);
      continue;
    }
    const next = nextQueue.shift();
    if (next != null) result.push(next);
  }

  // New filtered ids that were never in custom order.
  for (const id of nextQueue) {
    if (!result.includes(id)) result.push(id);
  }

  return result;
}
