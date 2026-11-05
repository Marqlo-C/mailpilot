/**
 * Postage-stamp silhouette geometry.
 *
 * Edge rhythm: semicircle bites separated by flat lands (no knife cusps).
 * Face insets are fixed CSS pixels — changing top/bottom does NOT change
 * left/right (and vice versa). Tooth radius is locked to the target so
 * resizing one axis can't rescale the other.
 */

function coord(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** Flat land length as a fraction of tooth diameter (2r). */
export const STAMP_FLAT_RATIO = 0.7;

/** Target tooth radius for job-card badges. */
export const STAMP_BADGE_TOOTH_PX = 4;

/**
 * Paper margin between perforated outer edge and content, in CSS px.
 * Independent axes — edit one without affecting the other.
 */
export const STAMP_FACE_INSET_X_PX = 3.75;
/** Top/bottom paper margin (25% under prior 11). */
export const STAMP_FACE_INSET_Y_PX = 8.25;

export type StampMetrics = {
  d: string;
  width: number;
  height: number;
  radius: number;
  flat: number;
  teethX: number;
  teethY: number;
  faceInsetX: number;
  faceInsetY: number;
};

/**
 * Build a stamp path sized to at least `widthPx` × `heightPx`.
 * Snaps each axis to an exact tooth pitch independently; radius stays fixed.
 */
export function buildStampPath(
  widthPx: number,
  heightPx: number,
  targetToothPx = STAMP_BADGE_TOOTH_PX
): StampMetrics {
  const r = Math.max(2.5, targetToothPx);
  const k = STAMP_FLAT_RATIO;
  const flat = 2 * r * k;
  const pitch = 2 * r + flat;

  // width = teeth * pitch + flat  →  teeth = (width - flat) / pitch
  const teethX = Math.max(
    2,
    Math.round((Math.max(32, widthPx) - flat) / pitch)
  );
  const teethY = Math.max(
    2,
    Math.round((Math.max(24, heightPx) - flat) / pitch)
  );

  const width = teethX * pitch + flat;
  const height = teethY * pitch + flat;

  const sweep = 0;
  const parts: string[] = [`M 0 0`];

  for (let i = 0; i < teethX; i += 1) {
    const biteStart = flat + i * pitch;
    parts.push(`L ${coord(biteStart)} 0`);
    parts.push(
      `A ${coord(r)} ${coord(r)} 0 0 ${sweep} ${coord(biteStart + 2 * r)} 0`
    );
  }
  parts.push(`L ${coord(width)} 0`);

  for (let i = 0; i < teethY; i += 1) {
    const biteStart = flat + i * pitch;
    parts.push(`L ${coord(width)} ${coord(biteStart)}`);
    parts.push(
      `A ${coord(r)} ${coord(r)} 0 0 ${sweep} ${coord(width)} ${coord(biteStart + 2 * r)}`
    );
  }
  parts.push(`L ${coord(width)} ${coord(height)}`);

  for (let i = 0; i < teethX; i += 1) {
    const biteStart = flat + i * pitch;
    parts.push(`L ${coord(width - biteStart)} ${coord(height)}`);
    parts.push(
      `A ${coord(r)} ${coord(r)} 0 0 ${sweep} ${coord(width - biteStart - 2 * r)} ${coord(height)}`
    );
  }
  parts.push(`L 0 ${coord(height)}`);

  for (let i = 0; i < teethY; i += 1) {
    const biteStart = flat + i * pitch;
    parts.push(`L 0 ${coord(height - biteStart)}`);
    parts.push(
      `A ${coord(r)} ${coord(r)} 0 0 ${sweep} 0 ${coord(height - biteStart - 2 * r)}`
    );
  }
  parts.push(`L 0 0`);
  parts.push("Z");

  return {
    d: parts.join(" "),
    width,
    height,
    radius: r,
    flat,
    teethX,
    teethY,
    faceInsetX: STAMP_FACE_INSET_X_PX,
    faceInsetY: STAMP_FACE_INSET_Y_PX,
  };
}
