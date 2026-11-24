/**
 * Shared host frames for Ace / Snapshot composite glyphs.
 * BR corner is open so a corner accent (sparkle / rotate) can cut through.
 */

/** Lucide Mail outline + flap; open at lower-right. */
export function MailEnvelopeBrBite({
  /** Bottom stroke ends here (x); nudge right when LR accent shifts right. */
  bottomEndX = 10.5,
  /** Right edge drawn down only to this y — below is open for the accent. */
  rightOpenY = 11.5,
}: {
  bottomEndX?: number;
  rightOpenY?: number;
} = {}) {
  const bottomH = bottomEndX - 4;
  return (
    <>
      <path
        d={`M22 ${rightOpenY}V6A2 2 0 0 0 20 4H4A2 2 0 0 0 2 6v12a2 2 0 0 0 2 2h${bottomH}`}
      />
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
    </>
  );
}

/** Lucide FileText page + fold + lines; open at lower-right. */
export function FilePageBrBite({
  /** Bottom page stroke ends here (x); pull left to clear LR rotate. */
  bottomEndX = 12.5,
  /** Lowest text line ends here (x). */
  bottomLineEndX = 12,
  /** Right edge drawn down only to this y — below is open for the accent. */
  rightOpenY = 11.25,
}: {
  bottomEndX?: number;
  bottomLineEndX?: number;
  rightOpenY?: number;
} = {}) {
  /** Bottom-left corner lands at x=6 before the horizontal run. */
  const bottomH = bottomEndX - 6;
  return (
    <>
      <path
        d={`M20 ${rightOpenY}V8a2.4 2.4 0 0 0-.708-1.706L15.704 2.706A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h${bottomH}`}
      />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" />
      <path d="M13 13H8" />
      <path d={`M${bottomLineEndX} 17H8`} />
    </>
  );
}
