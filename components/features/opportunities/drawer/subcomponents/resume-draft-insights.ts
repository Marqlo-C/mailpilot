import type { TailoredResumeDraft } from "@/lib/resume-draft";
import { formatDistanceToNow } from "@/lib/utils/format-distance";

import {
  estimateBlockHeight,
  getBlockId,
  PRINTABLE_HEIGHT,
  type DraftBlock,
} from "./resume-draft-layout";

export type ResumeDraftInsights = {
  lengthLabel: string;
  lengthDetail: string;
  spilled: boolean;
  rows: { label: string; value: string }[];
};

/**
 * Length / words / updated rows for the draft details (Gauge) menu.
 * Uses page-1 fill vs multi-page spill, matching export inclusion rules.
 */
export function computeResumeDraftInsights({
  draft,
  displayPages,
  blockHeights,
  totalPages,
  includeSummary,
}: {
  draft: TailoredResumeDraft;
  displayPages: DraftBlock[][];
  blockHeights: Record<string, number>;
  totalPages: number;
  includeSummary?: boolean;
}): ResumeDraftInsights {
  const pageBlocks = displayPages[0] ?? [];
  let used = 0;
  for (const block of pageBlocks) {
    used +=
      blockHeights[getBlockId(block)] ?? estimateBlockHeight(block, null);
  }
  const pct = Math.min(
    100,
    Math.max(0, Math.round((used / PRINTABLE_HEIGHT) * 100))
  );
  // Estimates alone can over-paginate for a frame after rewrite — only trust
  // spill once real block heights exist.
  const hasMeasuredHeights = Object.keys(blockHeights).length > 0;
  const spilled = hasMeasuredHeights && totalPages > 1;
  const lengthLabel = spilled ? `${totalPages} pages` : `${pct}% full`;
  const lengthDetail = spilled
    ? "A bit long for one page. Remove or shorten a few lines."
    : "How much of the page this resume uses.";

  const selected = new Set(
    draft.nodes.filter((node) => node.selected).map((node) => node.id)
  );
  const exportText = draft.nodes
    .filter((node) => {
      if (!node.selected) return false;
      if (node.parentId && !selected.has(node.parentId)) return false;
      if (includeSummary === false && node.section === "summary") return false;
      return true;
    })
    .map((node) => node.content)
    .join(" ");
  const words = (exportText.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g) ?? [])
    .length;

  const updatedAt = (() => {
    const parsed = new Date(draft.updatedAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDistanceToNow(parsed, { addSuffix: true });
  })();

  const rows: { label: string; value: string }[] = [
    { label: "Length", value: lengthLabel },
    { label: "Words", value: words.toLocaleString() },
  ];
  if (updatedAt) {
    rows.push({ label: "Updated", value: updatedAt });
  }

  return {
    lengthLabel,
    lengthDetail,
    spilled,
    rows,
  };
}
