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

/**
 * Physical Page Geometry (US Letter: 8.5in x 11in)
 * - 72 pt/inch in PDF -> 612pt x 792pt
 * - 96 px/inch in Web Preview (CSS) -> 816px x 1056px
 * - Margins: Top 32pt (42.67px), Bottom 32pt (42.67px), Horizontal 36pt (48px)
 * - Printable Area: 540pt x 728pt -> 720px x 970.67px
 * - Safe Printable Ceiling: 720pt -> 960px (incorporating font leading & kerning buffer)
 */
export const RESUME_PAGE_GEOMETRY = {
  sheetWidthPt: 612,
  sheetHeightPt: 792,
  sheetWidthPx: 816,
  sheetHeightPx: 1056,

  paddingTopPt: 32,
  paddingBottomPt: 32,
  paddingHorizontalPt: 36,

  paddingTopPx: RESUME_SPACING.pagePaddingTop.px, // 42.67
  paddingBottomPx: RESUME_SPACING.pagePaddingBottom.px, // 42.67
  paddingHorizontalPx: RESUME_SPACING.pagePaddingHorizontal.px, // 48

  printableWidthPt: 540,
  printableHeightPt: 728,
  printableWidthPx: ptToPx(540), // 720
  printableHeightPx: ptToPx(728), // 970.67

  safeCeilingPoints: 720,
  safeCeilingPx: ptToPx(720), // 960
} as const;
