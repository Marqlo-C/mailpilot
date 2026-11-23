import { randomUUID } from "crypto";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/validations/resume-draft.schema";

/**
 * Helper to construct a ResumeDraftNode with selected default true.
 */
export function createDraftNode(
  partial: Omit<ResumeDraftNode, "selected"> & { selected?: boolean }
): ResumeDraftNode {
  return { selected: true, ...partial };
}

/** Internal alias for convenience */
export const node = createDraftNode;

/**
 * Returns all active (selected) nodes in the draft whose parent (if any) is also active.
 */
export function activeResumeNodes(draft: TailoredResumeDraft): ResumeDraftNode[] {
  const selected = new Set(
    draft.nodes.filter((item) => item.selected).map((item) => item.id)
  );
  return draft.nodes.filter((item) => {
    if (!item.selected) return false;
    if (item.parentId && !selected.has(item.parentId)) return false;
    return true;
  });
}

/**
 * Patches a draft node. Selection cascades both ways for role/project entries:
 * - Deselecting (or selecting) a parent applies the same flag to every child.
 * - Re-including a child also re-includes its parent so the entry can export.
 */
export function patchResumeDraftNode(
  draft: TailoredResumeDraft,
  nodeId: string,
  patch: { content?: string; selected?: boolean }
): TailoredResumeDraft | null {
  const target = draft.nodes.find((item) => item.id === nodeId);
  if (!target) return null;
  const parentIdToRestore =
    patch.selected === true && target.parentId ? target.parentId : null;
  const nodes = draft.nodes.map((item) => {
    if (item.id === nodeId) {
      return {
        ...item,
        content: patch.content !== undefined ? patch.content : item.content,
        selected: patch.selected !== undefined ? patch.selected : item.selected,
      };
    }
    if (patch.selected !== undefined && item.parentId === nodeId) {
      return { ...item, selected: patch.selected };
    }
    if (parentIdToRestore && item.id === parentIdToRestore) {
      return { ...item, selected: true };
    }
    return item;
  });
  return touchDraft({ ...draft, nodes });
}

/**
 * Reorders a node up or down within its sibling cluster of the same type and parent.
 */
export function moveResumeNode(
  draft: TailoredResumeDraft,
  nodeId: string,
  direction: "up" | "down"
): TailoredResumeDraft {
  const index = draft.nodes.findIndex((item) => item.id === nodeId);
  if (index < 0) return draft;
  const current = draft.nodes[index];
  const roots: number[] = [];
  draft.nodes.forEach((item, itemIndex) => {
    if (item.type === current.type && item.parentId === current.parentId) {
      roots.push(itemIndex);
    }
  });
  const position = roots.indexOf(index);
  const swapWith = direction === "up" ? position - 1 : position + 1;
  if (swapWith < 0 || swapWith >= roots.length) return draft;

  const rangeOf = (start: number): [number, number] => {
    let end = start + 1;
    const parentId = draft.nodes[start]?.id;
    while (
      end < draft.nodes.length &&
      draft.nodes[end]?.parentId === parentId
    ) {
      end += 1;
    }
    return [start, end];
  };

  const [aStart, aEnd] = rangeOf(roots[position]);
  const [bStart, bEnd] = rangeOf(roots[swapWith]);
  const first: [number, number] = aStart < bStart ? [aStart, aEnd] : [bStart, bEnd];
  const second: [number, number] = aStart < bStart ? [bStart, bEnd] : [aStart, aEnd];
  const nodes = draft.nodes;
  const next = [
    ...nodes.slice(0, first[0]),
    ...nodes.slice(second[0], second[1]),
    ...nodes.slice(first[1], second[0]),
    ...nodes.slice(first[0], first[1]),
    ...nodes.slice(second[1]),
  ];
  return { ...draft, nodes: next, updatedAt: new Date().toISOString() };
}

/**
 * Updates the draft's updatedAt timestamp to current ISO date.
 */
export function touchDraft(draft: TailoredResumeDraft): TailoredResumeDraft {
  return { ...draft, updatedAt: new Date().toISOString() };
}

/**
 * Generates a unique UUID node identifier.
 */
export function newNodeId(): string {
  return randomUUID();
}
