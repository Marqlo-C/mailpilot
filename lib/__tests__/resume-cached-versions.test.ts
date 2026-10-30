import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/core/prisma";
import {
  saveMasterProfile,
  getMasterProfile,
  resetMasterProfile,
} from "@/app/actions/profile";
import type { MasterProfileInput, ProjectInput } from "@/lib/validations/profile";
import { parseAccountRules } from "@/lib/validations/rules";

describe("Cached Resume Multi-Version Lifecycle: Additive vs OverwriteAll", () => {
  let testAccountId: string;

  beforeAll(async () => {
    const acc = await prisma.account.create({
      data: {
        email: `test-lifecycle-${Date.now()}@example.com`,
      },
    });
    testAccountId = acc.id;
  });

  afterAll(async () => {
    if (testAccountId) {
      await prisma.account.deleteMany({
        where: { id: testAccountId },
      });
    }
  });

  const version1Draft: MasterProfileInput = {
    fullName: "Marq Lott",
    email: "marqlott@example.com",
    phone: "(213) 555-0199",
    location: "Sacramento, CA",
    summary: "Senior Systems Engineer specializing in distributed architectures.",
    links: [
      { label: "Portfolio", url: "https://marqlo-c.github.io" },
      { label: "GitHub", url: "https://github.com/Marqlo-C" },
    ],
    skills: [
      {
        label: "Languages",
        parentCategory: null,
        items: [{ name: "TypeScript", proficiency: null }, { name: "Python", proficiency: null }],
      },
    ],
    experiences: [
      {
        company: "Alpha Tech",
        role: "Software Engineer",
        location: "Sacramento, CA",
        category: "Work",
        startDate: "2022-01-01",
        endDate: null,
        displayOrder: 0,
        bullets: [
          {
            id: "b1",
            rawText: "Built microservices for real-time telemetry streaming.",
            technologies: ["TypeScript", "Node.js"],
            hasMetric: true,
          },
        ],
      },
    ],
    projects: [
      {
        name: "SafeHaven – Disguised Domestic Violence Safety Platform",
        description: "Crisis support platform featuring disguised utility covers and trauma-informed AI.",
        technologies: ["Next.js", "MongoDB Atlas", "Socket.io", "Anthropic Claude SDK", "Mapbox GL"],
        link: "https://github.com/Marqlo-C/SafeHaven",
        bullets: [
          "Deployed a full-stack Next.js application on Render with a MongoDB Atlas persistence layer, JWT stateless authentication, and bcryptjs credential hashing.",
          "Built a real-time crisis chat module over Socket.io WebSockets with sub-100ms latency, countering abuser surveillance.",
          "Integrated the Anthropic Claude SDK with trauma-informed prompt engineering to deliver 24/7 AI-driven safety-planning guidance, bypassing auditable phone hotlines as a covert support channel.",
          "Implemented a Mapbox GL geospatial resource layer for live shelter and legal aid discovery, paired with a Multer multimedia upload pipeline for in-app photo, audio, and video evidence journaling.",
        ],
        origin: "HUMAN_VERIFIED",
      },
      {
        name: "Embergency – Wildfire Response Assistant",
        description: "Emergency decision support tool exposing cellular infrastructure vulnerabilities during wildfires.",
        technologies: ["React", "Leaflet.js", "OpenCellID"],
        link: "https://github.com/Marqlo-C/Embergency--Wildfire_Response_Tool",
        bullets: [
          "Engineered a front-end decision support tool exposing real cellular infrastructure vulnerabilities by computing spatial intersections.",
          "Integrated 3 external APIs using async/await patterns to deliver a real-time operational picture.",
        ],
        origin: "HUMAN_VERIFIED",
      },
    ],
    education: [],
    certifications: [],
    awards: [],
    interests: [],
  };

  it("Step 1: Saves initial Master Profile (Version 1) with HUMAN_VERIFIED bullets", async () => {
    const saveRes = await saveMasterProfile(testAccountId, version1Draft);
    expect(saveRes.ok).toBe(true);

    const profileRes = await getMasterProfile(testAccountId);
    expect(profileRes.ok).toBe(true);
    if (!profileRes.ok || !profileRes.data) return;

    expect(profileRes.data.projects.length).toBe(2);

    const safeHaven = profileRes.data.projects.find((p: ProjectInput) => p.name.includes("SafeHaven"));
    expect(safeHaven).toBeDefined();
    expect(safeHaven?.origin).toBe("HUMAN_VERIFIED");
    expect(safeHaven?.bullets.length).toBe(4);

    // Every primary bullet in Version 1 is HUMAN_VERIFIED
    for (const bullet of safeHaven!.bullets) {
      expect(safeHaven?.bulletOrigins?.[bullet]).toBe("HUMAN_VERIFIED");
    }
  });

  it("Step 2: Additive consolidation with externally-sourced GitHub inference", async () => {
    const githubSyncPayload: MasterProfileInput = {
      ...version1Draft,
      projects: [
        {
          name: "SafeHaven",
          description: "Crisis support platform with disguised covers",
          technologies: ["Next.js", "Socket.io", "MongoDB", "GridFS"],
          link: "https://github.com/Marqlo-C/SafeHaven",
          bullets: [
            "Provided survivors with safety planning and emotional support through a trauma-informed assistant.",
            "Architected a zero-trace crisis intervention platform utilizing Next.js, Socket.io, and Mongoose.",
            "Configured a custom HTTP server with unified WebSocket upgrades using Next.js handlers.",
            "Implemented a cached DB connection and lazy GridFS initialization to prevent database connection pool exhaustion.",
          ],
          origin: "GITHUB_INFERRED",
        },
      ],
    };

    const syncRes = await saveMasterProfile(testAccountId, githubSyncPayload, {
      overwriteAll: false,
    });
    expect(syncRes.ok).toBe(true);

    const profileRes = await getMasterProfile(testAccountId);
    expect(profileRes.ok).toBe(true);
    if (!profileRes.ok || !profileRes.data) return;

    const safeHaven = profileRes.data.projects.find((p: ProjectInput) => p.name.includes("SafeHaven"));
    expect(safeHaven).toBeDefined();
    expect(safeHaven?.origin).toBe("HUMAN_VERIFIED");

    // All original 4 human bullets are still present and still HUMAN_VERIFIED
    for (const b of version1Draft.projects[0]!.bullets) {
      expect(safeHaven?.bullets).toContain(b);
      expect(safeHaven?.bulletOrigins?.[b]).toBe("HUMAN_VERIFIED");
    }

    // Inferred bullets are present with GITHUB_INFERRED
    const inferredDB = safeHaven!.bullets.find((b: string) => b.includes("cached DB connection"));
    expect(inferredDB).toBeDefined();
    expect(safeHaven?.bulletOrigins?.[inferredDB!]).toBe("GITHUB_INFERRED");
  });

  it("Step 3: Additive consolidation of Version 2 resume archives human revision as Prior Revision", async () => {
    // Version 2 has an updated Claude SDK bullet and a new human bullet
    const revisedClaudeBullet =
      "Integrated the Anthropic Claude SDK with trauma-informed prompt engineering to deliver 24/7 AI-driven safety-planning guidance, eliminating reliance on auditable phone hotlines.";
    const newHumanBullet =
      "Engineered an offline-first AES-256-GCM encrypted journaling engine with zero local remnants.";

    const version2Draft: MasterProfileInput = {
      ...version1Draft,
      projects: [
        {
          name: "SafeHaven – Disguised Domestic Violence Safety Platform",
          description: "Privacy-first crisis support platform featuring disguised utility covers.",
          technologies: ["Next.js", "MongoDB Atlas", "Socket.io", "Anthropic Claude SDK"],
          link: "https://github.com/Marqlo-C/SafeHaven",
          bullets: [
            version1Draft.projects[0]!.bullets[0]!, // unchanged
            version1Draft.projects[0]!.bullets[1]!, // unchanged
            revisedClaudeBullet, // revised (high overlap with original Claude bullet)
            version1Draft.projects[0]!.bullets[3]!, // unchanged
            newHumanBullet, // brand new human bullet
          ],
          origin: "HUMAN_VERIFIED",
        },
        version1Draft.projects[1]!, // Embergency unchanged
      ],
    };

    const updateRes = await saveMasterProfile(testAccountId, version2Draft, {
      overwriteAll: false,
    });
    expect(updateRes.ok).toBe(true);

    const profileRes = await getMasterProfile(testAccountId);
    expect(profileRes.ok).toBe(true);
    if (!profileRes.ok || !profileRes.data) return;

    const safeHaven = profileRes.data.projects.find((p: ProjectInput) => p.name.includes("SafeHaven"));
    expect(safeHaven).toBeDefined();

    // 1. Revised Claude bullet is the primary bullet with HUMAN_VERIFIED
    expect(safeHaven?.bullets).toContain(revisedClaudeBullet);
    expect(safeHaven?.bulletOrigins?.[revisedClaudeBullet]).toBe("HUMAN_VERIFIED");

    // 2. Old Claude bullet is archived in variants as ARCHIVED_REVISION with origin HUMAN_VERIFIED
    const oldClaudeBullet = version1Draft.projects[0]!.bullets[2]!;
    const archivedVariant = safeHaven?.variants?.find((v) => v.text === oldClaudeBullet);
    expect(archivedVariant).toBeDefined();
    expect(archivedVariant?.origin).toBe("HUMAN_VERIFIED");
    expect(archivedVariant?.status).toBe("ARCHIVED_REVISION");
    expect(archivedVariant?.shadowOf).toBe(revisedClaudeBullet);

    // 3. Non-replaced human bullets MUST REMAIN HUMAN_VERIFIED (never pushed to Externally-Sourced!)
    expect(safeHaven?.bulletOrigins?.[version1Draft.projects[0]!.bullets[0]!]).toBe("HUMAN_VERIFIED");
    expect(safeHaven?.bulletOrigins?.[version1Draft.projects[0]!.bullets[1]!]).toBe("HUMAN_VERIFIED");
    expect(safeHaven?.bulletOrigins?.[version1Draft.projects[0]!.bullets[3]!]).toBe("HUMAN_VERIFIED");

    // 4. New human bullet is HUMAN_VERIFIED
    expect(safeHaven?.bullets).toContain(newHumanBullet);
    expect(safeHaven?.bulletOrigins?.[newHumanBullet]).toBe("HUMAN_VERIFIED");
  });

  it("Step 4: Complete override (overwriteAll: true) wipes old projects and stale projectMeta", async () => {
    const version3OverrideDraft: MasterProfileInput = {
      fullName: "Marq Lott (Override)",
      email: "marqlott.new@example.com",
      phone: "(213) 555-9999",
      location: "San Francisco, CA",
      summary: "Rewritten profile for testing complete override.",
      links: [{ label: "Website", url: "https://example.com" }],
      skills: [
        {
          label: "Core",
          parentCategory: null,
          items: [{ name: "Rust", proficiency: null }],
        },
      ],
      experiences: [
        {
          company: "Beta Systems",
          role: "Lead Architect",
          location: "San Francisco, CA",
          category: "Work",
          startDate: "2024-01-01",
          endDate: null,
          displayOrder: 0,
          bullets: [
            {
              id: "b-override",
              rawText: "Architected distributed consensus engine handling 50k tx/sec.",
              technologies: ["Rust", "Raft"],
              hasMetric: true,
            },
          ],
        },
      ],
      projects: [
        {
          name: "OmniStore Distributed Consensus Engine",
          description: "High-throughput Paxos/Raft consensus layer in Rust.",
          technologies: ["Rust", "Tokio"],
          link: "https://github.com/Marqlo-C/OmniStore",
          bullets: [
            "Architected a Raft-based distributed commit log processing 50,000 requests per second with sub-5ms p99 latency.",
            "Formulated lock-free memory rings reducing CPU cache thrashing by 40% under high contention.",
          ],
          origin: "HUMAN_VERIFIED",
        },
      ],
      education: [],
      certifications: [],
      awards: [],
      interests: [],
    };

    const overrideRes = await saveMasterProfile(testAccountId, version3OverrideDraft, {
      overwriteAll: true,
    });
    expect(overrideRes.ok).toBe(true);

    const profileRes = await getMasterProfile(testAccountId);
    expect(profileRes.ok).toBe(true);
    if (!profileRes.ok || !profileRes.data) return;

    // Only OmniStore should exist
    expect(profileRes.data.projects.length).toBe(1);
    expect(profileRes.data.projects[0]?.name).toBe("OmniStore Distributed Consensus Engine");
    expect(profileRes.data.projects[0]?.origin).toBe("HUMAN_VERIFIED");

    // Old projects (SafeHaven, Embergency) must NOT be present in profile
    expect(profileRes.data.projects.some((p: ProjectInput) => p.name.includes("SafeHaven"))).toBe(false);
    expect(profileRes.data.projects.some((p: ProjectInput) => p.name.includes("Embergency"))).toBe(false);

    // Check accountSettings.rules directly to ensure NO ghost metadata lingers in projectMeta
    const settings = await prisma.accountSettings.findUnique({
      where: { accountId: testAccountId },
    });
    const rules = parseAccountRules(settings?.rules);
    const metaKeys = Object.keys(rules.projectMeta || {});

    // Must not contain any safehaven or embergency keys!
    for (const key of metaKeys) {
      expect(key.toLowerCase()).not.toContain("safehaven");
      expect(key.toLowerCase()).not.toContain("embergency");
    }

    // Must contain omnistore keys
    expect(metaKeys.some((k) => k.toLowerCase().includes("omnistore"))).toBe(true);
  });

  it("Step 5: Reset Profile cleanly purges all data and projectMeta", async () => {
    const resetRes = await resetMasterProfile(testAccountId);
    expect(resetRes.ok).toBe(true);

    const profileRes = await getMasterProfile(testAccountId);
    expect(profileRes.ok).toBe(true);
    if (!profileRes.ok || !profileRes.data) return;

    expect(profileRes.data.projects.length).toBe(0);
    expect(profileRes.data.experiences.length).toBe(0);

    const settings = await prisma.accountSettings.findUnique({
      where: { accountId: testAccountId },
    });
    const rules = parseAccountRules(settings?.rules);
    expect(rules.projectMeta).toEqual({});
  });
});
