/**
 * Shared Lucide Sparkles accents used by Snapshot / File composite glyphs.
 * UL plus-marks + LR center star (scaled) — keep overflow visible on the parent svg.
 */

/** Center 4-point star from Lucide `Sparkles` (the big middle glyph). */
export const SPARKLES_CENTER_STAR =
  "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z";

/** Star authored around ~(12,12); stroke compensated so weight stays ~host. */
export const LR_STAR_SCALE = 0.52;

/** Default composite stroke (Snapshot / attach at 24→16px). */
export const COMPOSITE_STROKE = 2;

/** Ace regen at 17px — slightly thinner so scaled glyphs don’t look heavy. */
export const ACE_REGEN_STROKE = 1.75;

/** Close top-left plus pair — stock relative offset, outside the host glyph UL. */
export function SparklesUlPlusMarks() {
  return (
    <>
      <path d="M4 -1H2" />
      <path d="M3 -2v2" />
      <path d="M-2 1v4" />
      <path d="M0 3H-4" />
    </>
  );
}

/** Lucide Sparkles center star — lower-right corner of the host glyph. */
export function SparklesLrCenterStar({
  strokeVisual = COMPOSITE_STROKE,
}: {
  strokeVisual?: number;
} = {}) {
  return (
    <g
      transform={`translate(20 20) scale(${LR_STAR_SCALE}) translate(-12 -12)`}
      strokeWidth={strokeVisual / LR_STAR_SCALE}
    >
      <path d={SPARKLES_CENTER_STAR} />
    </g>
  );
}

/**
 * Lucide RotateCw — lower-right badge (same scale treatment as the sparkle star).
 * Arc start trimmed (~12°) — small gap between arrow head and stroke start.
 */
export function RotateLrMark({
  strokeVisual = ACE_REGEN_STROKE,
  /** LR anchor in 24×24 host space (mail nudges right of file). */
  anchorX = 20,
  anchorY = 20,
}: {
  strokeVisual?: number;
  anchorX?: number;
  anchorY?: number;
} = {}) {
  return (
    <g
      transform={`translate(${anchorX} ${anchorY}) scale(${LR_STAR_SCALE}) translate(-12 -12)`}
      strokeWidth={strokeVisual / LR_STAR_SCALE}
    >
      {/* φ≈12° from east: (12+9cos12, 12+9sin12) → (20.81, 13.87) */}
      <path d="M20.81 13.87a9 9 0 1 1-8.81-10.87c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </g>
  );
}
