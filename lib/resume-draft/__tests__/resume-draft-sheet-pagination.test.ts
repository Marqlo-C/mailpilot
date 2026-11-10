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
import type { TailoredResumeDraft } from "@/lib/resume-draft";

describe("ResumeDraftSheet Multi-Page Pagination & Seam Logic", () => {
  it("defines physical dimensions matching US Letter specs", () => {
    expect(SHEET_WIDTH).toBe(816);
    expect(PAGE_HEIGHT).toBe(1056);
    expect(PRINTABLE_HEIGHT).toBe(960);
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

  it("partitions dense content across multiple physical pages when printable height (960px) is exceeded", () => {
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

    // 960px / 50px = 19 blocks fit on page 1 (950px <= 960px)
    // Remaining 6 blocks go to page 2 (300px <= 960px)
    expect(pages[0]?.length).toBe(19);
    expect(pages[1]?.length).toBe(6);
  });

  it("protects against orphan role headers: moves role header to Page 2 if its first bullet does not fit on Page 1", () => {
    const blocks: DraftBlock[] = [];

    // Fill Page 1 with bullets totaling 930px (just 30px left before 960px)
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

    // Role header: height 20px (fits on Page 1: 930 + 20 = 950px <= 960px)
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

    // First bullet for this role: height 35px (does NOT fit: 950 + 35 = 985px > 960px)
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
      measuredHeights[`prev-bullet-${i}`] = 93; // 10 * 93 = 930px
    }
    measuredHeights["new-exp-header"] = 20;
    measuredHeights["new-exp-bullet-1"] = 35;
    measuredHeights["new-exp-bullet-2"] = 35;

    const pages = partitionBlocksIntoPages(blocks, measuredHeights);

    expect(pages.length).toBe(2);
    // Page 1 should contain the 10 previous bullets
    expect(pages[0]?.length).toBe(10);
    const p0_9 = pages[0]?.[9];
    expect(p0_9?.kind === "node" ? p0_9.node.id : null).toBe("prev-bullet-9");

    // Page 2 MUST start with new-exp-header, NOT leaving it orphaned on Page 1!
    expect(pages[1]?.length).toBe(3);
    const p1_0 = pages[1]?.[0];
    const p1_1 = pages[1]?.[1];
    const p1_2 = pages[1]?.[2];
    expect(p1_0?.kind === "node" ? p1_0.node.id : null).toBe("new-exp-header");
    expect(p1_1?.kind === "node" ? p1_1.node.id : null).toBe("new-exp-bullet-1");
    expect(p1_2?.kind === "node" ? p1_2.node.id : null).toBe("new-exp-bullet-2");
  });

  it("Option 1 Atomicity: keeps entire role intact on Page 2 when only some of its bullets fit on Page 1", () => {
    const blocks: DraftBlock[] = [];

    // Fill Page 1 with 850px of content (110px remaining until 960px)
    for (let i = 0; i < 17; i++) {
      blocks.push({
        kind: "node",
        heading: i === 0 ? "Previous Roles" : null,
        node: {
          id: `role-a-bullet-${i}`,
          section: "experience",
          type: "experience_bullet",
          content: `Accomplished milestone ${i}`,
          selected: true,
        },
      });
    }

    // Role B: Header (30px) + Bullet 1 (40px) + Bullet 2 (40px) + Bullet 3 (40px) = 150px total.
    // Notice: Header (30px) + Bullet 1 (40px) = 70px <= 110px remaining,
    // so in a naive bullet-level split, Header + Bullet 1 would fit on Page 1 and Bullet 2+3 would split to Page 2.
    // Under Option 1 (Role Atomicity), the ENTIRE role B must be kept together on Page 2!
    blocks.push({
      kind: "node",
      heading: null,
      node: {
        id: "role-b-header",
        section: "experience",
        type: "experience_header",
        content: "Lead Distributed Systems Engineer · Enterprise Systems",
        selected: true,
      },
    });

    for (let j = 1; j <= 3; j++) {
      blocks.push({
        kind: "node",
        heading: null,
        node: {
          id: `role-b-bullet-${j}`,
          section: "experience",
          type: "experience_bullet",
          parentId: "role-b-header",
          content: `Delivered high impact distributed project ${j}`,
          selected: true,
        },
      });
    }

    const measuredHeights: Record<string, number> = {};
    for (let i = 0; i < 17; i++) {
      measuredHeights[`role-a-bullet-${i}`] = 50; // 17 * 50 = 850px
    }
    measuredHeights["role-b-header"] = 30;
    measuredHeights["role-b-bullet-1"] = 40;
    measuredHeights["role-b-bullet-2"] = 40;
    measuredHeights["role-b-bullet-3"] = 40;

    const pages = partitionBlocksIntoPages(blocks, measuredHeights);

    expect(pages.length).toBe(2);
    // Page 1 contains only Role A's 17 bullets (850px)
    expect(pages[0]?.length).toBe(17);
    // Page 2 contains all 4 blocks of Role B intact: header + 3 bullets
    expect(pages[1]?.length).toBe(4);
    expect(pages[1]?.[0]?.kind === "node" ? pages[1][0].node.id : null).toBe("role-b-header");
    expect(pages[1]?.[1]?.kind === "node" ? pages[1][1].node.id : null).toBe("role-b-bullet-1");
    expect(pages[1]?.[2]?.kind === "node" ? pages[1][2].node.id : null).toBe("role-b-bullet-2");
    expect(pages[1]?.[3]?.kind === "node" ? pages[1][3].node.id : null).toBe("role-b-bullet-3");
  });

  it("Option 1 Atomicity: keeps entire project intact on Page 2 when project exceeds remaining space", () => {
    const blocks: DraftBlock[] = [];

    // Fill Page 1 with 880px
    for (let i = 0; i < 11; i++) {
      blocks.push({
        kind: "node",
        heading: i === 0 ? "Experience" : null,
        node: {
          id: `exp-${i}`,
          section: "experience",
          type: "experience_bullet",
          content: `Experience item ${i}`,
          selected: true,
        },
      });
    }

    // Project: Header (25px) + 2 Bullets (40px each) = 105px total.
    // 880px + 105px = 985px > 960px.
    blocks.push({
      kind: "node",
      heading: "Projects",
      node: {
        id: "proj-header-1",
        section: "projects",
        type: "project_header",
        content: "Distributed Mesh Router",
        selected: true,
      },
    });

    blocks.push({
      kind: "node",
      heading: null,
      node: {
        id: "proj-bullet-1",
        section: "projects",
        type: "project_bullet",
        parentId: "proj-header-1",
        content: "Implemented custom raft consensus protocol with zero packet drops.",
        selected: true,
      },
    });

    blocks.push({
      kind: "node",
      heading: null,
      node: {
        id: "proj-bullet-2",
        section: "projects",
        type: "project_bullet",
        parentId: "proj-header-1",
        content: "Wrote high-throughput benchmarking suite with eBPF tracing.",
        selected: true,
      },
    });

    const measuredHeights: Record<string, number> = {};
    for (let i = 0; i < 11; i++) {
      measuredHeights[`exp-${i}`] = 80; // 11 * 80 = 880px
    }
    measuredHeights["proj-header-1"] = 25;
    measuredHeights["proj-bullet-1"] = 40;
    measuredHeights["proj-bullet-2"] = 40;

    const pages = partitionBlocksIntoPages(blocks, measuredHeights);

    expect(pages.length).toBe(2);
    // Page 1 contains experience
    expect(pages[0]?.length).toBe(11);
    // Page 2 contains the whole project: header with section heading + 2 bullets
    expect(pages[1]?.length).toBe(3);
    expect(pages[1]?.[0]?.kind === "node" ? pages[1][0].node.id : null).toBe("proj-header-1");
    expect(pages[1]?.[1]?.kind === "node" ? pages[1][1].node.id : null).toBe("proj-bullet-1");
    expect(pages[1]?.[2]?.kind === "node" ? pages[1][2].node.id : null).toBe("proj-bullet-2");
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
