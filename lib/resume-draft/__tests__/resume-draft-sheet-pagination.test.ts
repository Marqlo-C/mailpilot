import { describe, expect, it } from "vitest";
import {
  buildBlocks,
  estimateBlockHeight,
  partitionBlocksIntoPages,
  PRINTABLE_HEIGHT,
  SHEET_WIDTH,
  PAGE_HEIGHT,
  PAGE_GAP,
  type DraftBlock,
} from "@/components/opportunities/drawer/resume-draft-sheet";
import type { TailoredResumeDraft } from "@/lib/types/resume-draft";

describe("ResumeDraftSheet Multi-Page Pagination & Seam Logic", () => {
  it("defines physical dimensions matching US Letter specs", () => {
    expect(SHEET_WIDTH).toBe(816);
    expect(PAGE_HEIGHT).toBe(1056);
    expect(PRINTABLE_HEIGHT).toBe(992);
    expect(PAGE_GAP).toBe(24);
  });

  it("partitions a compact draft cleanly into a single page", () => {
    const draft: TailoredResumeDraft = {
      opportunityId: "opp-1",
      updatedAt: new Date().toISOString(),
      exportConfig: {
        includeSummary: true,
        pageBudget: "auto",
      },
      nodes: [
        {
          id: "header-1",
          section: "contact",
          type: "header",
          content: "Alex Morgan",
          selected: true,
          metadata: { contactLine: "alex@example.com · (555) 000-1111 · Seattle, WA" },
        },
        {
          id: "summary-1",
          section: "summary",
          type: "summary",
          content: "Experienced systems architect with a track record of scaling high-throughput distributed pipelines.",
          selected: true,
        },
        {
          id: "skill-1",
          section: "skills",
          type: "skill_group",
          content: "TypeScript, Go, PostgreSQL, Redis, Kubernetes, Terraform",
          selected: true,
          metadata: { category: "Core Technologies" },
        },
        {
          id: "exp-header-1",
          section: "experience",
          type: "experience_header",
          content: "Principal Architect · TechCorp",
          selected: true,
          metadata: { startDate: "2021", endDate: "Present" },
        },
        {
          id: "exp-bullet-1",
          section: "experience",
          type: "experience_bullet",
          parentId: "exp-header-1",
          content: "Led architecture migration to event-driven services reducing end-to-end latency by 45%.",
          selected: true,
        },
      ],
    };

    const blocks = buildBlocks(draft);
    expect(blocks.length).toBe(5);

    const pages = partitionBlocksIntoPages(blocks, {});
    expect(pages.length).toBe(1);
    expect(pages[0]?.length).toBe(5);
  });

  it("partitions dense content across multiple physical pages when printable height (992px) is exceeded", () => {
    const blocks: DraftBlock[] = [];
    // 25 bullets, each measured at 50px = 1250px total content
    for (let i = 0; i < 25; i++) {
      blocks.push({
        kind: "node",
        heading: i === 0 ? "Experience" : null,
        node: {
          id: `node-${i}`,
          section: "experience",
          type: "experience_bullet",
          content: `Demonstrated measurable outcome and strategic cross-functional impact in project ${i}.`,
          selected: true,
        },
      });
    }

    const measuredHeights: Record<string, number> = {};
    for (let i = 0; i < 25; i++) {
      measuredHeights[`node-${i}`] = 50;
    }

    const pages = partitionBlocksIntoPages(blocks, measuredHeights);
    expect(pages.length).toBe(2);

    // 992px / 50px = 19 blocks fit on page 1 (950px <= 992px)
    // Remaining 6 blocks go to page 2 (300px <= 992px)
    expect(pages[0]?.length).toBe(19);
    expect(pages[1]?.length).toBe(6);
  });

  it("protects against orphan role headers: moves role header to Page 2 if its first bullet does not fit on Page 1", () => {
    const blocks: DraftBlock[] = [];

    // Fill Page 1 with bullets totaling 970px (just 22px left before 992px)
    for (let i = 0; i < 10; i++) {
      blocks.push({
        kind: "node",
        heading: i === 0 ? "Prior History" : null,
        node: {
          id: `prev-bullet-${i}`,
          section: "experience",
          type: "experience_bullet",
          content: `Bullet ${i} of previous role`,
          selected: true,
        },
      });
    }

    // Role header: height 20px (fits on Page 1: 970 + 20 = 990px <= 992px)
    blocks.push({
      kind: "node",
      heading: "New Company Experience",
      node: {
        id: "new-exp-header",
        section: "experience",
        type: "experience_header",
        content: "Staff Engineer · NextGen",
        selected: true,
      },
    });

    // First bullet for this role: height 35px (does NOT fit: 990 + 35 = 1025px > 992px)
    blocks.push({
      kind: "node",
      heading: null,
      node: {
        id: "new-exp-bullet-1",
        section: "experience",
        type: "experience_bullet",
        parentId: "new-exp-header",
        content: "Engineered scalable telemetry collection and distributed logging engine.",
        selected: true,
      },
    });

    // Second bullet
    blocks.push({
      kind: "node",
      heading: null,
      node: {
        id: "new-exp-bullet-2",
        section: "experience",
        type: "experience_bullet",
        parentId: "new-exp-header",
        content: "Mentored 8 mid-level and junior engineers across platform teams.",
        selected: true,
      },
    });

    const measuredHeights: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      measuredHeights[`prev-bullet-${i}`] = 97; // 10 * 97 = 970px
    }
    measuredHeights["new-exp-header"] = 20;
    measuredHeights["new-exp-bullet-1"] = 35;
    measuredHeights["new-exp-bullet-2"] = 35;

    const pages = partitionBlocksIntoPages(blocks, measuredHeights);

    expect(pages.length).toBe(2);
    // Page 1 should contain the 10 previous bullets
    expect(pages[0]?.length).toBe(10);
    expect(pages[0]?.[9]?.node.id).toBe("prev-bullet-9");

    // Page 2 MUST start with new-exp-header, NOT leaving it orphaned on Page 1!
    expect(pages[1]?.length).toBe(3);
    expect(pages[1]?.[0]?.node.id).toBe("new-exp-header");
    expect(pages[1]?.[1]?.node.id).toBe("new-exp-bullet-1");
    expect(pages[1]?.[2]?.node.id).toBe("new-exp-bullet-2");
  });

  it("estimateBlockHeight provides realistic heuristic heights for various node types", () => {
    const headerBlock: DraftBlock = {
      kind: "node",
      heading: null,
      node: {
        id: "h-1",
        section: "contact",
        type: "header",
        content: "Taylor Reed",
        selected: true,
        metadata: { contactLine: "taylor@domain.com · 555-0199" },
      },
    };
    expect(estimateBlockHeight(headerBlock)).toBeGreaterThan(50);

    const bulletBlock: DraftBlock = {
      kind: "node",
      heading: null,
      node: {
        id: "b-1",
        section: "experience",
        type: "experience_bullet",
        content: "Brief single line bullet.",
        selected: true,
      },
    };
    expect(estimateBlockHeight(bulletBlock)).toBeGreaterThanOrEqual(20);
    expect(estimateBlockHeight(bulletBlock)).toBeLessThanOrEqual(30);

    // Bullet with refine active adds input height
    expect(estimateBlockHeight(bulletBlock, "b-1")).toBeGreaterThan(50);
  });
});
