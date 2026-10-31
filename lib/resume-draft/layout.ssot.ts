/**
 * ============================================================================
 * RESUME LAYOUT, TYPOGRAPHY & SPACING (SINGLE SOURCE OF TRUTH)
 *
 * Centralizes all dimensions, font sizes, line heights, and vertical margins
 * across all render targets:
 * - PDF (@react-pdf/renderer) -> Points (pt)
 * - Web Preview (ResumeDraftSheet) -> CSS Pixels (px: 1 pt = 96/72 px = 1.3333px)
 * - Microsoft Word (compiled OOXML) -> Twips / Dxa (dxa: 1 pt = 20 dxa)
 * ============================================================================
 */

export function ptToPx(pt: number): number {
  return Number((pt * (96 / 72)).toFixed(2));
}

export function ptToPxStr(pt: number): string {
  return `${ptToPx(pt)}px`;
}

export function ptToDxa(pt: number): number {
  return Math.round(pt * 20);
}

export const RESUME_FONTS = {
  primary: "Calibri",
  primaryBold: "Calibri",
  fallbackCss: "Calibri, Carlito, sans-serif",
} as const;

export interface TypographyToken {
  pt: number;
  px: number;
  pxStr: string;
  dxa: number;
  lineHeight: number;
}

function makeTypographyToken(pt: number, lineHeight = 1.15): TypographyToken {
  const px = ptToPx(pt);
  return {
    pt,
    px,
    pxStr: `${px}px`,
    dxa: ptToDxa(pt),
    lineHeight,
  };
}

export const RESUME_TYPOGRAPHY = {
  name: makeTypographyToken(18, 1.15),
  heading: makeTypographyToken(11, 1.15),
  roleTitle: makeTypographyToken(10, 1.15),
  summary: makeTypographyToken(9.5, 1.15),
  bullet: makeTypographyToken(9.5, 1.15),
  educationTitle: makeTypographyToken(9.5, 1.15),
  body: makeTypographyToken(9.5, 1.15),
  muted: makeTypographyToken(9, 1.15),
  skills: makeTypographyToken(9, 1.25),
  contact: makeTypographyToken(8.5, 1.15),
} as const;

export interface SpacingToken {
  pt: number;
  px: number;
  pxStr: string;
  dxa: number;
}

function makeSpacingToken(pt: number): SpacingToken {
  const px = ptToPx(pt);
  return {
    pt,
    px,
    pxStr: `${px}px`,
    dxa: ptToDxa(pt),
  };
}

export const RESUME_SPACING = {
  // Page Margins
  pagePaddingTop: makeSpacingToken(32),
  pagePaddingBottom: makeSpacingToken(32),
  pagePaddingHorizontal: makeSpacingToken(36),

  // Header Spacing
  nameToContact: makeSpacingToken(2),
  contactToFirstSection: makeSpacingToken(6), // Dense, tightly integrated header

  // Section Spacing
  sectionBefore: makeSpacingToken(8), // Space before a section heading (dense)
  sectionHeadingBottom: makeSpacingToken(4), // Space below heading border

  // Item & Bullet Spacing
  roleTitleToFirstBullet: makeSpacingToken(2.5),
  roleTitleToTrailingGap: makeSpacingToken(8),
  bulletMarginLeft: makeSpacingToken(8), // 8pt in PDF = 10.67px in Preview
  bulletMarkerWidth: makeSpacingToken(10), // 10pt in PDF = 13.33px in Preview
  bulletSpacing: makeSpacingToken(2.25),
  roleToRole: makeSpacingToken(6.5), // Space between multi-bullet roles/projects
  degreeToDegree: makeSpacingToken(3.5), // Space between compact degrees
  certToCert: makeSpacingToken(3),
  interestToInterest: makeSpacingToken(3),
} as const;
