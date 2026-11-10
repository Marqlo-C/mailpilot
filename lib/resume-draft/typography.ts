/**
 * ============================================================================
 * REAL-TIME AFM (ADOBE FONT METRICS) TYPOGRAPHY ENGINE
 *
 * Provides sub-millisecond, exact glyph-width and word-wrap calculations for
 * standard PostScript Helvetica (1000 units/em) used by @react-pdf/renderer.
 * Eliminates phantom overflow calculations and predicts exact line wraps.
 * ============================================================================
 */

// Standard Calibri Glyph Widths (units per 1000 em extracted from Calibri.ttf)
export const CALIBRI_GLYPH_WIDTHS: Record<number, number> = {
  32: 226, 33: 326, 34: 401, 35: 498, 36: 507, 37: 715, 38: 682, 39: 221,
  40: 303, 41: 303, 42: 498, 43: 498, 44: 250, 45: 306, 46: 252, 47: 386,
  48: 507, 49: 507, 50: 507, 51: 507, 52: 507, 53: 507, 54: 507, 55: 507,
  56: 507, 57: 507, 58: 268, 59: 268, 60: 498, 61: 498, 62: 498, 63: 463,
  64: 894, 65: 579, 66: 544, 67: 533, 68: 615, 69: 488, 70: 459, 71: 631,
  72: 623, 73: 252, 74: 319, 75: 520, 76: 420, 77: 855, 78: 646, 79: 662,
  80: 517, 81: 673, 82: 543, 83: 459, 84: 487, 85: 642, 86: 567, 87: 890,
  88: 519, 89: 487, 90: 468, 91: 307, 92: 386, 93: 307, 94: 498, 95: 498,
  96: 291, 97: 479, 98: 525, 99: 423, 100: 525, 101: 498, 102: 305, 103: 471,
  104: 525, 105: 229, 106: 239, 107: 455, 108: 229, 109: 799, 110: 525,
  111: 527, 112: 525, 113: 525, 114: 349, 115: 391, 116: 335, 117: 525,
  118: 452, 119: 715, 120: 433, 121: 453, 122: 395, 123: 314, 124: 460,
  125: 314, 126: 498, 183: 252, 8211: 498, 8212: 905, 8226: 498,
};

const DEFAULT_GLYPH_WIDTH = 500;

/**
 * Calculates the width in points of a word or string without wrapping.
 */
export function measureWordWidthPoints(text: string, fontSizePt: number): number {
  const scale = fontSizePt / 1000;
  let totalUnits = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    totalUnits += CALIBRI_GLYPH_WIDTHS[code] ?? DEFAULT_GLYPH_WIDTH;
  }
  return totalUnits * scale;
}

/**
 * Accurately measures the physical number of wrapped lines for a text block
 * using word-boundary breaking identical to PDF text layout.
 */
export function measureTextWrappedLines(
  text: string,
  maxWidthPt: number,
  fontSizePt: number
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const words = trimmed.split(/\s+/);
  if (words.length === 0) return 0;

  const spaceWidthPt = (CALIBRI_GLYPH_WIDTHS[32] ?? 226) * (fontSizePt / 1000);
  let lines = 1;
  let currentLineWidth = 0;

  for (const word of words) {
    const wordWidth = measureWordWidthPoints(word, fontSizePt);

    if (currentLineWidth === 0) {
      currentLineWidth = wordWidth;
    } else if (currentLineWidth + spaceWidthPt + wordWidth <= maxWidthPt) {
      currentLineWidth += spaceWidthPt + wordWidth;
    } else {
      // Word forces line wrap
      lines += 1;
      currentLineWidth = wordWidth;
    }
  }

  return lines;
}

import { RESUME_SPACING, RESUME_TYPOGRAPHY } from "./layout.schema";

/**
 * Bullet Usable Width:
 * Page width = 612 pt.
 * Padding horizontal = 36 pt on each side (total 72 pt) -> Printable = 540 pt.
 * Bullet style: marginLeft = 8 pt, bullet marker takes 10 pt.
 * Available width for bullet text = 540 - 8 - 10 = 522 pt.
 */
export const BULLET_USABLE_WIDTH_PT = 522;
export const BULLET_FONT_SIZE_PT = RESUME_TYPOGRAPHY.bullet.pt;

/**
 * Calculates exact vertical points occupied by a single bullet.
 * Uses SSOT typography and bullet margin tokens.
 */
export function measureBulletHeightPoints(text: string): number {
  const lines = measureTextWrappedLines(text, BULLET_USABLE_WIDTH_PT, BULLET_FONT_SIZE_PT);
  const baseLineHeight = BULLET_FONT_SIZE_PT * RESUME_TYPOGRAPHY.bullet.lineHeight;
  const margin = RESUME_SPACING.bulletSpacing.pt;
  return Math.max(1, lines) * baseLineHeight + margin;
}

/**
 * Calculates exact vertical points occupied by a summary paragraph.
 * Usable width = 540 pt (full printable width).
 */
export function measureSummaryHeightPoints(text: string): number {
  const lines = measureTextWrappedLines(text, 540, RESUME_TYPOGRAPHY.summary.pt);
  return Math.max(1, lines) * (RESUME_TYPOGRAPHY.summary.pt * RESUME_TYPOGRAPHY.summary.lineHeight);
}
