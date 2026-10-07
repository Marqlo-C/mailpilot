/** Soft teal-tinted wash for selected rows/cards. */
export const SELECT_HIGHLIGHT_FILL_CLASSNAME =
  "bg-[linear-gradient(135deg,hsl(174_34%_48%_/_0.10)_0%,hsl(174_34%_48%_/_0.13)_55%,hsl(174_34%_48%_/_0.16)_100%)]";

/**
 * Perimeter stroke via inset shadow so it tracks border-radius flush with the
 * fill (CSS borders often leave a 1px corner/edge gap on rounded cards).
 * Hex #9FCFD2 at ~95% (F2).
 */
const GROUP_STROKE_FULL = "shadow-[inset_0_0_0_2px_#9FCFD2F2]";
const GROUP_STROKE_SIDES =
  "shadow-[inset_2px_0_0_0_#9FCFD2F2,inset_-2px_0_0_0_#9FCFD2F2]";
const GROUP_STROKE_START =
  "shadow-[inset_0_2px_0_0_#9FCFD2F2,inset_2px_0_0_0_#9FCFD2F2,inset_-2px_0_0_0_#9FCFD2F2]";
const GROUP_STROKE_END =
  "shadow-[inset_0_-2px_0_0_#9FCFD2F2,inset_2px_0_0_0_#9FCFD2F2,inset_-2px_0_0_0_#9FCFD2F2]";

/**
 * Standalone selected-card outline (Job Radar) — same #9FCFD2 teal as
 * subscription group selection. Uses a real `border-2` (not inset shadow) so
 * the stroke sits flush on `rounded-2xl` and doesn’t fight corner chrome.
 * Pair with matching `border-2` on the resting card to avoid size shift.
 * Pair with {@link SELECT_HIGHLIGHT_FILL_CLASSNAME}.
 */
export const SELECT_HIGHLIGHT_CLASSNAME =
  "border-2 border-[#9FCFD2]/95 shadow-md";

/** Faint row rule kept between cards inside a selected group. */
export const SELECT_HIGHLIGHT_GROUP_DIVIDER_CLASSNAME =
  "border-b border-b-[hsl(220_14%_90%)]";

/**
 * Row stacking — pair with overflow-visible so a border glow can paint
 * over neighbors when enabled. No radius: flush with dense table rows.
 */
export const SELECT_HIGHLIGHT_ROW_LAYOUT_CLASSNAME = "relative z-10";

/**
 * Outer border glow for densetabled rows. Toggle off per surface
 * (e.g. Subscriptions) via {@link selectHighlightRowClassName}.
 */
export const SELECT_HIGHLIGHT_BORDER_CLASSNAME =
  "shadow-[0_0_0_1px_rgba(28,48,78,0.2),0_0_14px_rgba(36,64,104,0.14)]";

/**
 * Dense-table row highlight. Border glow on by default; pass `{ border: false }`
 * to keep layout/fill pairing without the halo.
 */
export function selectHighlightRowClassName(
  options: { border?: boolean } = {}
): string {
  const { border = true } = options;
  return [
    SELECT_HIGHLIGHT_ROW_LAYOUT_CLASSNAME,
    border ? SELECT_HIGHLIGHT_BORDER_CLASSNAME : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type SelectionGroupEdges = {
  selected: boolean;
  /** First row in a contiguous selected run. */
  isGroupStart: boolean;
  /** Last row in a contiguous selected run. */
  isGroupEnd: boolean;
};

/** Contiguous-selection edges for the item at `index` in `orderedIds`. */
export function getSelectionGroupEdges(
  orderedIds: readonly string[],
  selectedIds: readonly string[],
  index: number
): SelectionGroupEdges {
  const selectedSet = new Set(selectedIds);
  const id = orderedIds[index];
  const selected = id !== undefined && selectedSet.has(id);
  if (!selected) {
    return { selected: false, isGroupStart: false, isGroupEnd: false };
  }
  const prevId = index > 0 ? orderedIds[index - 1] : undefined;
  const nextId =
    index < orderedIds.length - 1 ? orderedIds[index + 1] : undefined;
  return {
    selected: true,
    isGroupStart: !prevId || !selectedSet.has(prevId),
    isGroupEnd: !nextId || !selectedSet.has(nextId),
  };
}

/** Outer-corner radius for a selection group (`xl` matches subscription cards). */
export type SelectionGroupRadius = "sm" | "xl";

const GROUP_RADIUS_TOP: Record<SelectionGroupRadius, string> = {
  sm: "rounded-t-sm",
  xl: "rounded-t-xl",
};

const GROUP_RADIUS_BOTTOM: Record<SelectionGroupRadius, string> = {
  sm: "rounded-b-sm",
  xl: "rounded-b-xl",
};

/**
 * Fill + perimeter outline for a selected row/card inside a contiguous group.
 * Interior rows keep a faint divider; only the group perimeter uses the
 * highlight stroke.
 */
export function selectHighlightGroupClassName(
  edges: SelectionGroupEdges,
  options: {
    /** Default radius for group start/end corners. */
    radius?: SelectionGroupRadius;
    /** Override top radius when this row is the group start. */
    startRadius?: SelectionGroupRadius;
    /** Override bottom radius when this row is the group end. */
    endRadius?: SelectionGroupRadius;
  } = {}
): string {
  if (!edges.selected) return "";
  const startRadius = options.startRadius ?? options.radius ?? "sm";
  const endRadius = options.endRadius ?? options.radius ?? "sm";
  const parts = [
    SELECT_HIGHLIGHT_FILL_CLASSNAME,
    SELECT_HIGHLIGHT_ROW_LAYOUT_CLASSNAME,
  ];
  if (edges.isGroupStart) {
    parts.push(GROUP_RADIUS_TOP[startRadius]);
  } else {
    parts.push("rounded-t-none");
  }
  if (edges.isGroupEnd) {
    parts.push(GROUP_RADIUS_BOTTOM[endRadius]);
  } else {
    // Quiet gray rule only — no teal on interior seams.
    parts.push("rounded-b-none", SELECT_HIGHLIGHT_GROUP_DIVIDER_CLASSNAME);
  }
  if (edges.isGroupStart && edges.isGroupEnd) {
    parts.push(GROUP_STROKE_FULL);
  } else if (edges.isGroupStart) {
    parts.push(GROUP_STROKE_START);
  } else if (edges.isGroupEnd) {
    parts.push(GROUP_STROKE_END);
  } else {
    parts.push(GROUP_STROKE_SIDES);
  }
  return parts.join(" ");
}
