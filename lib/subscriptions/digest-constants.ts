/** Client-safe briefing/digest constants (no Node / googleapis imports). */

export const MAX_BRIEFING_DAYS = 10;

export type DateRangeValue = {
  from: Date | undefined;
  to: Date | undefined;
};

/** Inclusive day span between two local calendar dates. */
export function inclusiveDaySpan(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export function isValidBriefingRange(
  from: Date | undefined,
  to: Date | undefined
): boolean {
  if (!from || !to) return false;
  const span = inclusiveDaySpan(from, to);
  return span >= 1 && span <= MAX_BRIEFING_DAYS;
}

/**
 * Inject overflow guards so stored briefing HTML fits the preview iframe
 * without horizontal scroll (covers briefings created before layout fixes).
 */
export function constrainBriefingPreviewHtml(html: string): string {
  // Avoid word-break on all td/span — that collapses "In this snapshot" to one
  // letter per line when the hairline cell is width:100% in a fixed table.
  const guard =
    '<style id="mp-preview-fit">html,body{max-width:100%!important;overflow-x:hidden!important;width:100%!important;}img,table{max-width:100%!important;}.mp-break,h3,p{overflow-wrap:anywhere;word-break:break-word;}</style>';
  // Always re-inject so older aggressive guards get replaced.
  const withoutOld = html.replace(
    /<style id="mp-preview-fit">[\s\S]*?<\/style>/gi,
    ""
  );
  if (withoutOld.includes("</head>")) {
    return withoutOld.replace("</head>", `${guard}</head>`);
  }
  if (/<body[\s>]/i.test(withoutOld)) {
    return withoutOld.replace(/<body([^>]*)>/i, `<body$1>${guard}`);
  }
  return `${guard}${withoutOld}`;
}
