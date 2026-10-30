import { describe, it, expect, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deduplicateProjectCollection } from "@/lib/profile/deduplication";
import { prisma } from "@/lib/core/prisma";
import { getMasterProfile, updateMasterProfile } from "@/app/actions/profile";
import type { ProjectInput } from "@/lib/validations/profile";

describe("Candidate Resume 3x Reconciliation Audit", () => {
  const resumeProjects: ProjectInput[] = [
    {
      name: "SafeHaven – Disguised Domestic Violence Safety Platform",
      description: "Privacy-first crisis support platform featuring disguised utility covers, encrypted journaling, and trauma-informed AI.",
      technologies: ["Next.js", "MongoDB Atlas", "Socket.io", "Anthropic Claude SDK", "Mapbox GL", "JWT", "Render"],
      bullets: [
        "Deployed a full-stack Next.js application on Render with a MongoDB Atlas persistence layer, JWT stateless authentication, and bcryptjs credential hashing behind role-aware API middleware to enforce zero-persistence session management on shared devices.",
        "Built a real-time crisis chat module over Socket.io WebSockets with sub-100ms latency, countering the 97% of IPV cases where abusers actively surveil victims’ SMS and call records.",
        "Integrated the Anthropic Claude SDK with trauma-informed prompt engineering to deliver 24/7 AI-driven safety-planning guidance, bypassing auditable phone hotlines as a covert support channel.",
        "Implemented a Mapbox GL geospatial resource layer for live shelter and legal aid discovery, paired with a Multer multimedia upload pipeline for in-app photo, audio, and video evidence journaling.",
      ],
      origin: "HUMAN_VERIFIED",
      link: "https://github.com/Marqlo-C/SafeHaven",
    },
    {
      name: "Embergency – Wildfire Response Assistant",
      description: "Emergency decision support tool exposing cellular infrastructure vulnerabilities during wildfires.",
      technologies: ["React", "Leaflet.js", "OpenCellID", "JavaScript"],
      bullets: [
        "Engineered a front-end decision support tool exposing real cellular infrastructure vulnerabilities by computing spatial intersections between live wildfire perimeters and OpenCellID dead zone data under hackathon time constraints.",
        "Integrated 3 external APIs using async/await patterns to deliver a real-time operational picture for first responders; deployed end-to-end from development through production with dynamic spatial rendering via Leaflet.js.",
      ],
      origin: "HUMAN_VERIFIED",
      link: "https://github.com/Marqlo-C/Embergency--Wildfire_Response_Tool",
    },
    {
      name: "mailpilot",
      description: "AI-assisted email triage and newsletter management dashboard.",
      technologies: ["Next.js", "TypeScript", "Prisma", "PostgreSQL", "Google OAuth"],
      bullets: [
        "Developed a Next.js dashboard that connects to Gmail, detects newsletter subscriptions, and triages job-related emails into actionable workflows.",
        "Implemented multi-account Gmail linking with Google OAuth and subscription management with RFC 8058 one-click unsubscribe and cleanup options.",
        "Designed an AI-assisted processing pipeline with multi-provider routing (OpenRouter, OpenAI, Groq, DeepSeek, Anthropic, Gemini, or local Ollama) for email classification and automation.",
      ],
      origin: "HUMAN_VERIFIED",
      link: "https://github.com/Marqlo-C/mailpilot",
    },
  ];

  const githubIngestedProjects: ProjectInput[] = [
    {
      name: "SafeHaven",
      description: "Crisis support platform with disguised utility covers",
      technologies: ["Next.js", "Socket.io", "MongoDB", "GridFS", "Multer"],
      bullets: [
        "Provided survivors with safety planning and emotional support through a trauma-informed assistant.",
        "Architected a zero-trace crisis intervention platform utilizing Next.js, Socket.io, and Mongoose to provide a discreet and secure sanctuary mesh.",
        "Configured a custom HTTP server with unified WebSocket upgrades using Next.js standard serverless handlers to prevent WebSocket upgrade hooks.",
        "Automated socket handshake and room authorizations using WebSocket connections and JWT verification.",
        "Integrated a centralized feature orchestration mechanism to gate all application subsystems, including PWA, Auth, Chat, Journal, AI, Geolocation, SOS, and Trusted Contacts.",
        "Implemented a cached DB connection and lazy GridFS initialization to prevent database connection pool exhaustion during hot-module reloads and serverless recycling.",
        "Deployed a real-time emergency mesh and incident dispatch system using peer-to-peer messaging and emergency SOS broadcasts.",
        "Designed an anonymous friend relational graph with scrubbed real account usernames and random generated identifiers.",
        "Engineered HTTP 206 byte-range streaming for mobile Safari and Chromium support.",
        "Optimized the emergency SOS dispatch pipeline with coordinate bounds validation and timestamp checking.",
        "Integrated a private evidence journal and media streaming engine with admissible incident documentation and in-memory upload processing.",
      ],
      origin: "GITHUB_INFERRED",
      link: "https://github.com/Marqlo-C/SafeHaven",
    },
    {
      name: "Embergency--Wildfire_Response_Tool",
      description: "Wildfire situational awareness dashboard and routing tool",
      technologies: ["JavaScript", "OpenWeatherMap", "Xweather", "Leaflet"],
      bullets: [
        "Automated API request and response handling using JavaScript async/await, integrating with OpenWeatherMap, Xweather, and Unwired Labs APIs.",
        "Formulated a decoupled monorepo workspace utilizing Vite for front-end development and Tailwind CSS for utility-first styling.",
      ],
      origin: "GITHUB_INFERRED",
      link: "https://github.com/Marqlo-C/Embergency--Wildfire_Response_Tool",
    },
    {
      name: "Connect_4_Player--Agent",
      description: "Adversarial search agent and game engine",
      technologies: ["Python"],
      bullets: [
        "Implemented Connect 4 game engine utilizing Python object-oriented patterns to model game board state and legal action validation.",
        "Architected AI player agents, including minimax, alpha-beta, and Monte Carlo tree search algorithms to evaluate game states.",
      ],
      origin: "GITHUB_INFERRED",
      link: "https://github.com/Marqlo-C/Connect_4_Player--Agent",
    },
  ];

  it("Run 1: First reconciliation correctly labels User-Verified and Externally-Sourced bullets without inversion", () => {
    const run1 = deduplicateProjectCollection([
      ...resumeProjects,
      ...githubIngestedProjects,
    ]);

    expect(run1).toHaveLength(4); // SafeHaven, Embergency, mailpilot, Connect 4

    const safeHaven = run1.find((p) => p.name.includes("SafeHaven"))!;
    expect(safeHaven).toBeDefined();
    expect(safeHaven.origin).toBe("HUMAN_VERIFIED");

    // 1. Verify that "Integrated the Anthropic Claude SDK..." is in primary bullets and labeled HUMAN_VERIFIED
    const claudeBullet = safeHaven.bullets.find((b) => b.includes("Anthropic Claude SDK"));
    expect(claudeBullet).toBeDefined();
    expect(safeHaven.bulletOrigins?.[claudeBullet!]).toBe("HUMAN_VERIFIED");

    // 2. Verify all 4 resume bullets are present and HUMAN_VERIFIED
    for (const resumeB of resumeProjects[0]!.bullets) {
      expect(safeHaven.bullets).toContain(resumeB);
      expect(safeHaven.bulletOrigins?.[resumeB]).toBe("HUMAN_VERIFIED");
    }

    // 3. Verify that the overlapping inferred bullet is a companion variant shadowing the Claude SDK bullet
    const companion = safeHaven.variants?.find((v) =>
      v.text.includes("Provided survivors with safety planning")
    );
    expect(companion).toBeDefined();
    expect(companion!.origin).toBe("GITHUB_INFERRED");
    expect(companion!.shadowOf).toBe(claudeBullet);

    // 4. Verify that distinct, non-overlapping GitHub capabilities enter primary bullets as additive externally-sourced items
    const webSocketBullet = safeHaven.bullets.find((b) =>
      b.includes("WebSocket upgrades")
    );
    expect(webSocketBullet).toBeDefined();
    expect(safeHaven.bulletOrigins?.[webSocketBullet!]).toBe("GITHUB_INFERRED");
    // 4 resume bullets + 10 distinct GitHub bullets = 14 primary bullets total
    expect(safeHaven.bullets).toHaveLength(14);

    // Embergency check
    const embergency = run1.find((p) => p.name.includes("Embergency"))!;
    expect(embergency.origin).toBe("HUMAN_VERIFIED");
    expect(embergency.name).toBe("Embergency – Wildfire Response Assistant");
    expect(embergency.bulletOrigins?.[embergency.bullets[0]!]).toBe("HUMAN_VERIFIED");
  });

  it("Run 2: Re-running resume upload over Run 1 preserves stability and human labels", () => {
    const run1 = deduplicateProjectCollection([
      ...resumeProjects,
      ...githubIngestedProjects,
    ]);

    // Feed Run 1 back through with resumeProjects (simulating re-uploading resume)
    const run2 = deduplicateProjectCollection([
      ...run1,
      ...resumeProjects,
    ]);

    expect(run2).toHaveLength(4);

    const safeHaven = run2.find((p) => p.name.includes("SafeHaven"))!;
    expect(safeHaven.origin).toBe("HUMAN_VERIFIED");

    const claudeBullet = safeHaven.bullets.find((b) => b.includes("Anthropic Claude SDK"));
    expect(claudeBullet).toBeDefined();
    expect(safeHaven.bulletOrigins?.[claudeBullet!]).toBe("HUMAN_VERIFIED");

    // Variant count remains stable
    expect(safeHaven.variants?.length).toBe(run1.find((p) => p.name.includes("SafeHaven"))!.variants?.length);
  });

  it("Run 3: Re-running GitHub sync over Run 2 preserves human bullets and updates inferred variants without duplicates", () => {
    const run1 = deduplicateProjectCollection([
      ...resumeProjects,
      ...githubIngestedProjects,
    ]);

    const run2 = deduplicateProjectCollection([
      ...run1,
      ...resumeProjects,
    ]);

    // Feed Run 2 back through with fresh githubIngestedProjects (simulating re-syncing GitHub)
    const run3 = deduplicateProjectCollection([
      ...run2,
      ...githubIngestedProjects,
    ]);

    expect(run3).toHaveLength(4);

    const safeHaven = run3.find((p) => p.name.includes("SafeHaven"))!;
    expect(safeHaven.origin).toBe("HUMAN_VERIFIED");

    // Claude SDK bullet is STILL primary and HUMAN_VERIFIED
    const claudeBullet = safeHaven.bullets.find((b) => b.includes("Anthropic Claude SDK"));
    expect(claudeBullet).toBeDefined();
    expect(safeHaven.bulletOrigins?.[claudeBullet!]).toBe("HUMAN_VERIFIED");

    // Purely GitHub project remains GITHUB_INFERRED
    const connect4 = run3.find((p) => p.name.includes("Connect 4"))!;
    expect(connect4.origin).toBe("GITHUB_INFERRED");
    expect(connect4.bulletOrigins?.[connect4.bullets[0]!]).toBe("GITHUB_INFERRED");

    // No duplicate bullets created across repeated runs
    const uniqueBullets = new Set(safeHaven.bullets);
    expect(uniqueBullets.size).toBe(safeHaven.bullets.length);
  });

  it("Repairs active DB state: Claude SDK bullet is User-Verified primary and inferred bullet is variant", async () => {
    const account = await prisma.account.findFirst();
    if (!account) return;

    const res = await getMasterProfile(account.id);
    if (!res.ok || !res.data) return;

    const projects = res.data.projects.map((p) => {
      if (!p.name.includes("SafeHaven")) return p;

      const claudeVar = (p.variants || []).find((v) =>
        v.text.includes("Anthropic Claude SDK")
      );
      const existingClaudeBullet = p.bullets.find((b) =>
        b.includes("Anthropic Claude SDK")
      );
      const claudeText = claudeVar ? claudeVar.text : existingClaudeBullet;

      if (claudeText) {
        const bullets = claudeVar
          ? p.bullets.map((b) => (b.includes("Provided survivors") ? claudeText : b))
          : p.bullets;
        const bulletOrigins = { ...(p.bulletOrigins || {}) };
        bulletOrigins[claudeText] = "HUMAN_VERIFIED";

        let updatedVariants = (p.variants || []).filter(
          (v) => !v.text.includes("Anthropic Claude SDK")
        );
        const hasSurvivorVar = updatedVariants.some((v) =>
          v.text.includes("Provided survivors")
        );
        if (!hasSurvivorVar) {
          updatedVariants.push({
            id: `var-provided-survivors-${Date.now()}`,
            text: "Provided survivors with safety planning and emotional support through a trauma-informed assistant.",
            origin: "GITHUB_INFERRED" as const,
            shadowOf: claudeText,
            confidenceScore: 0.85,
            typologies: ["EXECUTION_DELIVERY"],
            status: "ACTIVE_VARIANT",
          });
        } else {
          updatedVariants = updatedVariants.map((v) =>
            v.text.includes("Provided survivors")
              ? { ...v, origin: "GITHUB_INFERRED" as const, shadowOf: claudeText }
              : v
          );
        }

        return {
          ...p,
          bullets,
          variants: updatedVariants,
          bulletOrigins,
          origin: "HUMAN_VERIFIED" as const,
        };
      }
      return p;
    });

    const updateRes = await updateMasterProfile(
      account.id,
      {
        ...res.data,
        projects: deduplicateProjectCollection(projects),
      },
      { summary: "Audit Bullet Repair" }
    );
    expect(updateRes.ok).toBe(true);

    // Verify after saving
    const verify = await getMasterProfile(account.id);
    expect(verify.ok).toBe(true);
    if (!verify.ok || !verify.data) return;

    const sh = verify.data.projects.find((p) => p.name.includes("SafeHaven"));
    expect(sh).toBeDefined();

    const claudeBullet = sh?.bullets.find((b) => b.includes("Anthropic Claude SDK"));
    expect(claudeBullet).toBeDefined();
    expect(sh?.bulletOrigins?.[claudeBullet!]).toBe("HUMAN_VERIFIED");

    const variant = sh?.variants?.find((v) => v.text.includes("Provided survivors"));
    expect(variant).toBeDefined();
    expect(variant?.origin).toBe("GITHUB_INFERRED");
    expect(variant?.shadowOf).toBe(claudeBullet);
  });
});
