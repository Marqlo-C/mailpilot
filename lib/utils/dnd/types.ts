/** Shared DnD policy shape for `useCardListGestures`. */
export type CardListGestureRules = {
  /** Same-list rearrange allowed right now. */
  canReorder: boolean;
  /**
   * Drop-zone ids that accept the current drag (e.g. "archive", "history").
   * When non-empty, drag may start even if `canReorder` is false so tab drops
   * still work outside Custom sort.
   */
  allowedDropZones?: readonly string[];
};
