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

/**
 * Calculate the global synchronized phase offset (in pixels) for any timestamp.
 * Because this depends purely on absolute performance.now() without arbitrary start offsets,
 * every wave component on the page shares the exact same phase at every instant.
 */
export function getSynchronizedWavePhase(now: number): number {
  const norm = ((now % WAVE_CYCLE_MS) + WAVE_CYCLE_MS) % WAVE_CYCLE_MS;
  return (norm / WAVE_CYCLE_MS) * WAVE_PERIOD_PX;
}
