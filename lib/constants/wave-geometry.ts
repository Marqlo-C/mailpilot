/**
 * Single source of truth for tactile wave geometry, colors, and timing across UI components
 * (WavySlider, WaveToggle, etc.).
 */

export const BRAND_TEAL = "#1ab5af";

/** Wave frequency and period geometry in CSS pixels — constant across all wave controls */
export const WAVE_HALF_PX = 7;
export const WAVE_SEGMENT_PX = WAVE_HALF_PX * 2; // 14px (peak → trough)
export const WAVE_PERIOD_PX = WAVE_SEGMENT_PX * 2; // 28px (peak → trough → peak)

/** Idle crawl speed — constant across all wave components to ensure synchronized motion */
export const WAVE_CYCLE_MS = 1900;

/** Default wave vertical metrics for sliders */
export const WAVE_SLIDER_MID_Y = 6;
export const WAVE_SLIDER_AMP_Y = 3;
export const WAVE_SLIDER_VB_H = 12;

/** Wave vertical metrics for toggle well (18px inner height) */
export const WAVE_TOGGLE_MID_Y = 9;
export const WAVE_TOGGLE_AMP_Y = 3;
export const WAVE_TOGGLE_VB_H = 18;

/**
 * Build a squiggle wave line for an exact pixel width without stretching.
 * Extends two full periods to ensure seamless translation with zero phase gaps.
 */
export function buildWavePath(
  widthPx: number,
  midY = WAVE_SLIDER_MID_Y,
  ampY = WAVE_SLIDER_AMP_Y
): string {
  const width = Math.max(WAVE_SEGMENT_PX, Math.ceil(widthPx));
  const startX = -WAVE_PERIOD_PX;
  let d = `M ${startX} ${midY} Q ${startX + WAVE_HALF_PX} ${midY - ampY}, ${startX + WAVE_SEGMENT_PX} ${midY}`;
  for (
    let x = startX + WAVE_SEGMENT_PX * 2;
    x <= width + WAVE_PERIOD_PX * 2;
    x += WAVE_SEGMENT_PX
  ) {
    d += ` T ${x} ${midY}`;
  }
  return d;
}

/**
 * Build a closed liquid wave path where everything beneath the wave line is filled.
 */
export function buildWaveFluidPath(
  widthPx: number,
  midY = WAVE_TOGGLE_MID_Y,
  ampY = WAVE_TOGGLE_AMP_Y,
  bottomY = WAVE_TOGGLE_VB_H + 6
): { linePath: string; fluidPath: string } {
  const width = Math.max(WAVE_SEGMENT_PX, Math.ceil(widthPx));
  const startX = -WAVE_PERIOD_PX;
  let d = `M ${startX} ${midY} Q ${startX + WAVE_HALF_PX} ${midY - ampY}, ${startX + WAVE_SEGMENT_PX} ${midY}`;
  let lastX = startX + WAVE_SEGMENT_PX;
  for (
    let x = startX + WAVE_SEGMENT_PX * 2;
    x <= width + WAVE_PERIOD_PX * 2;
    x += WAVE_SEGMENT_PX
  ) {
    d += ` T ${x} ${midY}`;
    lastX = x;
  }
  const fluidPath = `${d} L ${lastX} ${bottomY} L ${startX} ${bottomY} Z`;
  return { linePath: d, fluidPath };
}

type WavePoint = { x: number; y: number };

function waveCoord(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/**
 * One side of a closed outline, using the same quadratic wave as {@link buildWavePath}.
 * The current point is already `from`. `normal` points outward.
 * The wave returns to the centerline at every segment so corners can meet it.
 */
function wavySidePath(
  from: WavePoint,
  to: WavePoint,
  normal: WavePoint
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return "";

  const dir = { x: dx / len, y: dy / len };
  const segments = Math.floor(len / WAVE_SEGMENT_PX);
  if (segments < 1) {
    return ` L ${waveCoord(to.x)} ${waveCoord(to.y)}`;
  }

  const used = segments * WAVE_SEGMENT_PX;
  const pad = (len - used) / 2;
  const start = {
    x: from.x + dir.x * pad,
    y: from.y + dir.y * pad,
  };
  let d = "";
  if (pad > 0.25) {
    d += ` L ${waveCoord(start.x)} ${waveCoord(start.y)}`;
  }

  const control = {
    x: start.x + dir.x * WAVE_HALF_PX + normal.x * WAVE_SLIDER_AMP_Y,
    y: start.y + dir.y * WAVE_HALF_PX + normal.y * WAVE_SLIDER_AMP_Y,
  };
  const first = {
    x: start.x + dir.x * WAVE_SEGMENT_PX,
    y: start.y + dir.y * WAVE_SEGMENT_PX,
  };
  d += ` Q ${waveCoord(control.x)} ${waveCoord(control.y)}, ${waveCoord(first.x)} ${waveCoord(first.y)}`;

  for (let i = 2; i <= segments; i += 1) {
    const point = {
      x: start.x + dir.x * WAVE_SEGMENT_PX * i,
      y: start.y + dir.y * WAVE_SEGMENT_PX * i,
    };
    d += ` T ${waveCoord(point.x)} ${waveCoord(point.y)}`;
  }

  if (pad > 0.25) {
    d += ` L ${waveCoord(to.x)} ${waveCoord(to.y)}`;
  }
  return d;
}

/**
 * Closed rounded-rectangle outline whose straight sides use the slider wave.
 * Coordinates are CSS pixels. The wave stays inside the box.
 */
export function buildWavyRoundedRectPath(
  widthPx: number,
  heightPx: number,
  radius = 8
): string {
  const inset = WAVE_SLIDER_AMP_Y;
  if (widthPx < inset * 2 + 8 || heightPx < inset * 2 + 8) return "";

  const w = widthPx - inset * 2;
  const h = heightPx - inset * 2;
  const r = Math.min(Math.max(radius - inset, 2), w / 2 - 1, h / 2 - 1);
  if (r < 2) return "";

  const ox = inset;
  const oy = inset;
  const topL = { x: ox + r, y: oy };
  const topR = { x: ox + w - r, y: oy };
  const rightT = { x: ox + w, y: oy + r };
  const rightB = { x: ox + w, y: oy + h - r };
  const botR = { x: ox + w - r, y: oy + h };
  const botL = { x: ox + r, y: oy + h };
  const leftB = { x: ox, y: oy + h - r };
  const leftT = { x: ox, y: oy + r };
  const arc = `${waveCoord(r)} ${waveCoord(r)} 0 0 1`;

  return [
    `M ${waveCoord(topL.x)} ${waveCoord(topL.y)}`,
    wavySidePath(topL, topR, { x: 0, y: -1 }),
    `A ${arc} ${waveCoord(rightT.x)} ${waveCoord(rightT.y)}`,
    wavySidePath(rightT, rightB, { x: 1, y: 0 }),
    `A ${arc} ${waveCoord(botR.x)} ${waveCoord(botR.y)}`,
    wavySidePath(botR, botL, { x: 0, y: 1 }),
    `A ${arc} ${waveCoord(leftB.x)} ${waveCoord(leftB.y)}`,
    wavySidePath(leftB, leftT, { x: -1, y: 0 }),
    `A ${arc} ${waveCoord(topL.x)} ${waveCoord(topL.y)}`,
  ].join(" ");
}

/**
 * Calculate the global synchronized phase offset (in pixels) for any timestamp.
 * Because this depends purely on absolute performance.now() without arbitrary start offsets,
 * every wave component on the page shares the exact same phase at every instant.
 */
export function getSynchronizedWavePhase(now: number): number {
  const norm = ((now % WAVE_CYCLE_MS) + WAVE_CYCLE_MS) % WAVE_CYCLE_MS;
  return (norm / WAVE_CYCLE_MS) * WAVE_PERIOD_PX;
}
