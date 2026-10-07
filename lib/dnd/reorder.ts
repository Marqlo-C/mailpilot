/**
 * Move `movedIds` (preserving their relative order) so the block starts at
 * `targetIndex` in the list that remains after removal.
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
