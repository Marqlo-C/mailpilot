import { skillCategoryLabel } from "@/lib/profile/skill-groups";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/resume-draft";
import {
  RESUME_PAGE_GEOMETRY,
  RESUME_SPACING,
  RESUME_TYPOGRAPHY,
} from "@/lib/resume-draft/layout.schema";

export const SHEET_WIDTH = RESUME_PAGE_GEOMETRY.sheetWidthPx;
export const PAGE_HEIGHT = RESUME_PAGE_GEOMETRY.sheetHeightPx;
export const PAGE_PADDING_TOP = RESUME_PAGE_GEOMETRY.paddingTopPx;
export const PAGE_PADDING_BOTTOM = RESUME_PAGE_GEOMETRY.paddingBottomPx;
export const PAGE_PADDING_X = RESUME_PAGE_GEOMETRY.paddingHorizontalPx;
export const PRINTABLE_HEIGHT = RESUME_PAGE_GEOMETRY.safeCeilingPx;
export const PAGE_GAP = 24;

export type DraftBlock =
  | { kind: "node"; node: ResumeDraftNode; heading: string | null }
  | { kind: "skills"; nodes: ResumeDraftNode[] };

export const SECTION_LABEL: Record<ResumeDraftNode["section"], string | null> = {
  contact: null,
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications & Licenses",
  awards: "Honors & Awards",
  interests: "Interests",
};

export const SECTION_HEADING_CLASS =
  "border-b border-[#D1D5DB] pb-0.5 font-bold uppercase tracking-normal text-[#111827]";

function skillLabel(node: ResumeDraftNode): string | null {
  return skillCategoryLabel(node);
}

export function getBlockId(block: DraftBlock): string {
  return block.kind === "skills"
    ? `skills-${block.nodes.map((n) => n.id).join("-")}`
    : block.node.id;
}

export function estimateBlockHeight(
  block: DraftBlock,
  refineFor?: string | null
): number {
  const sectionHeadingH = Math.round(
    RESUME_TYPOGRAPHY.heading.px * RESUME_TYPOGRAPHY.heading.lineHeight +
      RESUME_SPACING.sectionBefore.px +
      RESUME_SPACING.sectionHeadingBottom.px
  );

  if (block.kind === "skills") {
    const headingHeight = sectionHeadingH;
    const totalChars = block.nodes.reduce(
      (acc, n) => acc + (skillLabel(n)?.length ?? 0) + n.content.length + 5,
      0
    );
    const lines = Math.max(1, Math.ceil(totalChars / 95));
    const lineHeight = Math.round(
      RESUME_TYPOGRAPHY.skills.px * RESUME_TYPOGRAPHY.skills.lineHeight
    );
    const refineExtra = block.nodes.some((n) => n.id === refineFor) ? 36 : 0;
    return headingHeight + lines * lineHeight + refineExtra;
  }

  const { node, heading } = block;
  const h = heading ? sectionHeadingH : 0;

  if (node.type === "header") {
    const hasContact =
      typeof node.metadata?.contactLine === "string" &&
      Boolean(node.metadata.contactLine);
    const nameH = Math.round(
      RESUME_TYPOGRAPHY.name.px * RESUME_TYPOGRAPHY.name.lineHeight +
        RESUME_SPACING.nameToContact.px
    );
    const contactH = hasContact
      ? Math.round(
          RESUME_TYPOGRAPHY.contact.px * RESUME_TYPOGRAPHY.contact.lineHeight +
            RESUME_SPACING.contactToFirstSection.px
        )
      : 0;
    return h + nameH + contactH;
  }

  const refineExtra = refineFor === node.id ? 36 : 0;

  if (node.type === "experience_header" || node.type === "project_header") {
    const roleH = Math.round(
      RESUME_TYPOGRAPHY.roleTitle.px * RESUME_TYPOGRAPHY.roleTitle.lineHeight +
        RESUME_SPACING.roleTitleToFirstBullet.px +
        (heading ? 0 : RESUME_SPACING.roleToRole.px)
    );
    return h + roleH + refineExtra;
  }

  const bullet =
    node.type === "experience_bullet" || node.type === "project_bullet";
  if (bullet) {
    const lines = Math.max(1, Math.ceil(node.content.length / 90));
    const bulletH =
      lines * 18 +
      Math.round(RESUME_SPACING.bulletSpacing.px) +
      2;
    return h + bulletH + refineExtra;
  }

  if (node.type === "education_item") {
    const eduH = Math.round(
      RESUME_TYPOGRAPHY.educationTitle.px *
        RESUME_TYPOGRAPHY.educationTitle.lineHeight +
        (heading ? 0 : RESUME_SPACING.degreeToDegree.px)
    );
    return h + eduH + refineExtra;
  }

  const lines = Math.max(1, Math.ceil(node.content.length / 90));
  const bodyH =
    lines *
      Math.round(RESUME_TYPOGRAPHY.body.px * RESUME_TYPOGRAPHY.body.lineHeight) +
    4;
  return h + bodyH + refineExtra;
}

export function buildBlocks(draft: TailoredResumeDraft): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let lastSection: ResumeDraftNode["section"] | null = null;
  for (let index = 0; index < draft.nodes.length; index += 1) {
    const node = draft.nodes[index];
    if (node.type === "skill_group") {
      const nodes = [node];
      while (draft.nodes[index + 1]?.type === "skill_group") {
        index += 1;
        nodes.push(draft.nodes[index]);
      }
      blocks.push({ kind: "skills", nodes });
      lastSection = "skills";
      continue;
    }
    const heading =
      node.section !== lastSection ? SECTION_LABEL[node.section] : null;
    lastSection = node.section;
    blocks.push({ kind: "node", node, heading });
  }
  return blocks;
}

export function getEntityTotalHeight(
  startIndex: number,
  blocks: DraftBlock[],
  blockHeights: Record<string, number>,
  refineFor?: string | null
): number {
  const headerBlock = blocks[startIndex];
  if (headerBlock.kind !== "node") return 0;
  const headerId = headerBlock.node.id;
  const headerH = blockHeights[headerId] ?? estimateBlockHeight(headerBlock, refineFor);
  let total = headerH;

  for (let j = startIndex + 1; j < blocks.length; j++) {
    const next = blocks[j];
    if (next.kind !== "node") break;
    const isChild =
      next.node.parentId === headerId ||
      (headerBlock.node.type === "experience_header" &&
        next.node.type === "experience_bullet" &&
        (!next.node.parentId || next.node.parentId === headerId)) ||
      (headerBlock.node.type === "project_header" &&
        next.node.type === "project_bullet" &&
        (!next.node.parentId || next.node.parentId === headerId));
    if (!isChild) break;
    const nextId = next.node.id;
    const nextH = blockHeights[nextId] ?? estimateBlockHeight(next, refineFor);
    total += nextH;
  }
  return total;
}

export function partitionBlocksIntoPages(
  blocks: DraftBlock[],
  blockHeights: Record<string, number>,
  refineFor?: string | null
): DraftBlock[][] {
  if (blocks.length === 0) return [];

  const result: DraftBlock[][] = [];
  let currentPage: DraftBlock[] = [];
  let currentHeight = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockId = getBlockId(block);
    const h = blockHeights[blockId] ?? estimateBlockHeight(block, refineFor);

    // OPTION 1: Role/Project Atomicity (Preemptive look-ahead)
    const isRoleOrProjectHeader =
      block.kind === "node" &&
      (block.node.type === "experience_header" ||
        block.node.type === "project_header");

    if (isRoleOrProjectHeader && currentPage.length > 0) {
      const entityTotalHeight = getEntityTotalHeight(
        i,
        blocks,
        blockHeights,
        refineFor
      );
      if (
        entityTotalHeight <= PRINTABLE_HEIGHT &&
        currentHeight + entityTotalHeight > PRINTABLE_HEIGHT
      ) {
        result.push(currentPage);
        currentPage = [block];
        currentHeight = h;
        continue;
      }
    }

    // If adding this block overflows printable height (and currentPage isn't empty)
    if (currentHeight + h > PRINTABLE_HEIGHT && currentPage.length > 0) {
      let roleHeaderIdx = -1;
      if (block.kind === "node") {
        const parentId = block.node.parentId;
        if (parentId) {
          roleHeaderIdx = currentPage.findIndex(
            (b) => b.kind === "node" && b.node.id === parentId
          );
        } else if (
          block.node.type === "experience_bullet" ||
          block.node.type === "project_bullet"
        ) {
          const expectedHeaderType =
            block.node.type === "experience_bullet"
              ? "experience_header"
              : "project_header";
          for (let k = currentPage.length - 1; k >= 0; k--) {
            const candidate = currentPage[k];
            if (
              candidate.kind === "node" &&
              candidate.node.type === expectedHeaderType
            ) {
              roleHeaderIdx = k;
              break;
            }
          }
        }
      }

      if (roleHeaderIdx > 0) {
        // Move header and already placed bullets of this role to the new page
        const precedingBlocks = currentPage.slice(0, roleHeaderIdx);
        const roleBlocks = currentPage.slice(roleHeaderIdx);
        result.push(precedingBlocks);

        currentPage = [...roleBlocks, block];
        currentHeight = currentPage.reduce((sum, b) => {
          const id = getBlockId(b);
          return sum + (blockHeights[id] ?? estimateBlockHeight(b, refineFor));
        }, 0);
      } else {
        result.push(currentPage);
        currentPage = [block];
        currentHeight = h;
      }
    } else {
      currentPage.push(block);
      currentHeight += h;
    }
  }

  if (currentPage.length > 0) {
    result.push(currentPage);
  }

  return result;
}
