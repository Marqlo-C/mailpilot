import { describe, it, expect } from "vitest";
import {
  clampSnippetAtBoundary,
  fillTeaserToTwoLines,
  formatOpportunityCardTeaser,
  formatOpportunityModalBody,
  isSynthesizedJobOverviewEcho,
  isTeaserJunkBlock,
  pickTeaserSourceParagraph,
  stripInlineMarkdownMarkers,
} from "../card-description";
import { parseJobDescriptionBlocks } from "../job-description-blocks";
import { splitJobDescriptionInline } from "../job-description-inline";
import {
  peelLeadingSectionLabel,
  matchSectionLabel,
  preferProseAfterSectionLabel,
  stripLeadingSectionLabels,
} from "../job-section-labels";
import { buildSynthesizedJobOverview } from "../scrubber";

const REMOLITY_DESCRIPTION = `Overview
Company Description Remolity, Inc. is a remote job platform that connects candidates with roles based on skills, salary, and lifestyle preferences. Founded in 2026, the company focuses on helping professionals find better-aligned remote career opportunities across multiple industries. Its user-friendly interface and transparent job listings make it easier for users to quickly discover roles that match their experience and workstyle. Remolity is committed to clarity, fairness, and empowering individuals to pursue sustainable remote careers.

Role Description The Software Engineer will design, develop, and maintain backend and platform features that power Remolity’s remote job matching experience. Day-to-day responsibilities include implementing and testing software components, integrating APIs, optimizing performance, and ensuring reliability and scalability of core services. The role also involves collaborating with product, design, and data teams to refine requirements, improve user experience, and support secure, high-quality deployments. This is a full-time remote role, and the team works asynchronously with clear communication and documentation.

Qualifications
Strong foundation in Computer Science, including data structures, algorithms, and software architecture.
Proficiency in Software Development and Programming, with experience building and maintaining production systems.
Hands-on experience in Back-End Web Development, including RESTful APIs, databases, and server-side frameworks.
Solid understanding of Object-Oriented Programming (OOP) principles and their practical application in modern codebases.
Experience with version control (e.g., Git) and collaborative development workflows.
Knowledge of cloud platforms or containerization (e.g., AWS, GCP, Docker, Kubernetes) is beneficial.
Ability to write clean, testable code and familiarity with automated testing and CI/CD practices.
Strong problem-solving skills, attention to detail, and ability to work effectively in a remote, distributed team.
Bachelor’s degree in Computer Science, Engineering, or related field, or equivalent practical experience.`;

const VIANT_DESCRIPTION = `Overview
**WHAT YOU’LL DO**

Viant is looking for a passionate Software Engineer with Clojure experience to work closely with our IRIS.TV engineering team. This role requires thorough knowledge of the Clojure standard libraries and ecosystem. Our engineering team is headquartered in Los Angeles and geographically distributed around the world. This is an exciting opportunity to work with big data, analytics, and real-time distributed systems in a fast-paced environment. The team leverages open source technologies and builds with hand tools, setting the bar high for a very robust and flexible data processing architecture for the company.

THE DAY-TO-DAY

Design and build data processing pipelines and APIs with the data engineering team
Track and optimize key performance metrics with the data science team
Solve a wide variety of engineering challenges using Clojure and free software tools on AWS
Work with high-availability distributed systems
Measure your own code in production and stay one step ahead of scaling needs
GREAT TO HAVE

**Experience with Clojure (required)** and distributed systems (e.g., microservices, fault-tolerant architectures)
Proficiency with Kafka, Redis, Docker, and Kubernetes
Strong problem-solver with a DevOps mindset and ability to work independently
Skilled in performance tuning (profiling, benchmarking, latency optimization)
Familiarity with data workflows (analytics, ML support) and domain knowledge in video, MarTech, or AdTech`;

describe("card-description", () => {
  describe("clampSnippetAtBoundary", () => {
    it("returns short text unchanged", () => {
      expect(clampSnippetAtBoundary("Short overview.", 220)).toBe("Short overview.");
    });

    it("cuts on a sentence boundary when possible", () => {
      const text =
        "We design products for global teams. You will partner with research and engineering daily. Extra trailing content that should not appear.";
      const clamped = clampSnippetAtBoundary(text, 80);
      expect(clamped.endsWith(".")).toBe(true);
      expect(clamped.length).toBeLessThanOrEqual(80);
      expect(clamped).not.toContain("Extra trailing");
    });

    it("falls back to a word boundary instead of mid-token cuts", () => {
      const text = "Collaborative crossfunctional productdiscovery workshop facilitation practice";
      const clamped = clampSnippetAtBoundary(text, 40);
      expect(clamped.endsWith("...")).toBe(true);
      expect(clamped.includes(" ")).toBe(true);
      expect(clamped.length).toBeLessThanOrEqual(43);
    });
  });

  describe("stripInlineMarkdownMarkers / junk", () => {
    it("strips bold markers for plain teasers", () => {
      expect(stripInlineMarkdownMarkers("Department:** Software Engineering")).toBe(
        "Department: Software Engineering"
      );
      expect(stripInlineMarkdownMarkers("**Experience with Clojure (required)**")).toBe(
        "Experience with Clojure (required)"
      );
    });

    it("flags metadata and heading-only junk", () => {
      expect(isTeaserJunkBlock("Department:** Software Engineering")).toBe(true);
      expect(isTeaserJunkBlock("**WHAT YOU’LL DO**")).toBe(true);
      expect(isTeaserJunkBlock("THE DAY-TO-DAY")).toBe(true);
    });
  });

  describe("isSynthesizedJobOverviewEcho", () => {
    it("detects exact synthesized overview", () => {
      const ctx = { roleTitle: "Designer", company: "Acme" };
      expect(isSynthesizedJobOverviewEcho(buildSynthesizedJobOverview(ctx), ctx)).toBe(true);
    });

    it("returns false for real role prose", () => {
      expect(
        isSynthesizedJobOverviewEcho(
          "Lead end-to-end product design for our growth surface area.",
          { roleTitle: "Designer", company: "Acme" }
        )
      ).toBe(false);
    });
  });

  describe("formatOpportunityCardTeaser", () => {
    it("returns short substantive text", () => {
      const teaser = formatOpportunityCardTeaser(
        "We are seeking an experienced coordinator to manage ongoing field studies across partner sites."
      );
      expect(teaser).toContain("experienced coordinator");
    });

    it("fills toward two lines and ellipsizes instead of stopping at the first sentence", () => {
      const teaser = formatOpportunityCardTeaser(VIANT_DESCRIPTION, {
        roleTitle: "Software Engineer (Clojure)",
        company: "Viant Technology",
      });
      expect(teaser).not.toBeNull();
      expect(teaser!.startsWith("Viant is looking for")).toBe(true);
      expect(teaser!.length).toBeGreaterThan(140);
      expect(teaser!.endsWith("...")).toBe(true);
      expect(teaser!).not.toContain("**");
      expect(teaser!.toLowerCase()).not.toContain("what you’ll do");
    });

    it("never uses Astrolab-style metadata as the teaser", () => {
      const teaser = formatOpportunityCardTeaser(
        [
          "Department:** Software Engineering",
          "",
          "Astrolab builds autonomous systems for planetary exploration and needs full-stack engineers who ship reliable tools for field operators.",
        ].join("\n")
      );
      expect(teaser).not.toBeNull();
      expect(teaser!).not.toMatch(/department/i);
      expect(teaser!).not.toContain("**");
      expect(teaser!).toContain("Astrolab builds");
    });

    it("clamps long text within card bounds and strips alert chrome", () => {
      const body = [
        "Job alert: Weekly digest",
        "You will own roadmap discovery, stakeholder facilitation, and delivery of high-impact initiatives across multiple product surfaces for our organization this year and next.",
        "Additional responsibilities include mentoring peers and improving process quality.",
      ].join(" ");
      const teaser = formatOpportunityCardTeaser(body);
      expect(teaser).not.toBeNull();
      expect(teaser!.length).toBeLessThanOrEqual(190);
      expect(teaser!.toLowerCase()).not.toContain("job alert");
    });

    it("returns null for synthesized metadata echo", () => {
      const ctx = { roleTitle: "Analyst", company: "Northwind" };
      const teaser = formatOpportunityCardTeaser(buildSynthesizedJobOverview(ctx), ctx);
      expect(teaser).toBeNull();
    });

    it("prefers overview paragraph after markdown heading", () => {
      const md = [
        "### About the company",
        "",
        "Northwind builds tools for enterprise customers worldwide.",
        "",
        "### Overview",
        "",
        "You will lead discovery workshops and ship accessible experiences for our core product. You partner with research and engineering every week.",
        "",
        "### Responsibilities",
        "",
        "- Own design systems",
        "- Partner with research",
      ].join("\n");
      const teaser = formatOpportunityCardTeaser(md, {
        roleTitle: "Product Designer",
        company: "Northwind",
      });
      expect(teaser).toContain("discovery workshops");
      expect(teaser).not.toContain("enterprise customers");
    });

    it("returns null for empty input", () => {
      expect(formatOpportunityCardTeaser(null)).toBeNull();
      expect(formatOpportunityCardTeaser("   ")).toBeNull();
    });

    it("fillTeaserToTwoLines appends ellipsis when cutting mid-prose", () => {
      const filled = fillTeaserToTwoLines(
        "Viant is looking for a passionate Software Engineer with Clojure experience to work closely with our IRIS.TV engineering team. This role requires thorough knowledge of the Clojure standard libraries and ecosystem."
      );
      expect(filled.endsWith("...")).toBe(true);
      expect(filled.length).toBeLessThanOrEqual(190);
      expect(filled).toContain("Viant is looking");
    });

    it("pickTeaserSourceParagraph skips WHAT YOU'LL DO heading", () => {
      const picked = pickTeaserSourceParagraph(VIANT_DESCRIPTION);
      expect(picked.startsWith("Viant is looking for")).toBe(true);
    });

    it("Remolity: strips section headers from the teaser face", () => {
      const teaser = formatOpportunityCardTeaser(REMOLITY_DESCRIPTION, {
        roleTitle: "Software Engineer",
        company: "Remolity",
      });
      expect(teaser).not.toBeNull();
      expect(teaser!).not.toMatch(/^(?:company|role)\s+description\b/i);
      expect(teaser!).not.toMatch(/company description/i);
      expect(teaser!).not.toMatch(/role description/i);
      expect(teaser!).toMatch(/^The Software Engineer will design/i);
      expect(teaser!.endsWith("...")).toBe(true);
    });

    it("strips a raw Role Description prefix even when that string is the whole pick", () => {
      const teaser = formatOpportunityCardTeaser(
        "Role Description The Software Engineer will design, develop, and maintain backend and platform features that power Remolity’s remote job matching experience. Day-to-day responsibilities include implementing and testing software components."
      );
      expect(teaser).not.toBeNull();
      expect(teaser!).toMatch(/^The Software Engineer will design/i);
      expect(teaser!).not.toMatch(/role description/i);
    });
  });

  describe("job-section-labels", () => {
    it("peels Company Description and Role Description inline labels", () => {
      const company = peelLeadingSectionLabel(
        "Company Description Remolity, Inc. is a remote job platform that connects candidates."
      );
      expect(company).not.toBeNull();
      expect(company!.kind).toBe("company");
      expect(company!.label.toLowerCase()).toContain("company description");
      expect(company!.body.startsWith("Remolity")).toBe(true);

      const role = peelLeadingSectionLabel(
        "Role Description The Software Engineer will design, develop, and maintain backend features."
      );
      expect(role).not.toBeNull();
      expect(role!.kind).toBe("role");
      expect(role!.body.startsWith("The Software Engineer")).toBe(true);

      const quals = peelLeadingSectionLabel("Qualifications");
      expect(quals).not.toBeNull();
      expect(quals!.kind).toBe("requirements");
      expect(quals!.body).toBe("");
    });

    it("matchSectionLabel recognizes overview and what you'll do", () => {
      expect(matchSectionLabel("Overview")?.kind).toBe("role");
      expect(matchSectionLabel("**WHAT YOU’LL DO**")?.kind).toBe("role");
    });

    it("stripLeadingSectionLabels removes Role/Company Description prefixes", () => {
      expect(
        stripLeadingSectionLabels(
          "Role Description The Software Engineer will design, develop, and maintain backend features."
        )
      ).toMatch(/^The Software Engineer will design/);

      expect(
        stripLeadingSectionLabels(
          "Company Description Remolity, Inc. is a remote job platform that connects candidates."
        )
      ).toMatch(/^Remolity, Inc\. is a remote job platform/);

      expect(
        stripLeadingSectionLabels("Role Description: The Software Engineer will design APIs.")
      ).toMatch(/^The Software Engineer will design/);
    });

    it("preferProseAfterSectionLabel jumps past company About to role prose in glued blobs", () => {
      const glued = [
        "Company Description Remolity, Inc. is a remote job platform that connects candidates with roles.",
        "Role Description The Software Engineer will design, develop, and maintain backend features for the platform.",
      ].join(" ");
      const preferred = preferProseAfterSectionLabel(glued);
      expect(preferred).toMatch(/^The Software Engineer will design/);
      expect(stripLeadingSectionLabels(preferred)).not.toMatch(/role description/i);
    });
  });

  describe("formatOpportunityModalBody", () => {
    it("preserves markdown headings and paragraph breaks", () => {
      const md = [
        "### Responsibilities",
        "",
        "You will partner with cross-functional teams to deliver outcomes.",
        "",
        "### Requirements",
        "",
        "- Strong communication",
        "- Portfolio of shipped work",
      ].join("\n");
      const body = formatOpportunityModalBody(md);
      expect(body).not.toBeNull();
      expect(body!).toContain("### Responsibilities");
      expect(body!).toContain("\n\n");
      expect(body!).toContain("- Strong communication");
    });

    it("returns null for empty or chrome-thin input without synthesizing", () => {
      expect(formatOpportunityModalBody(null)).toBeNull();
      expect(formatOpportunityModalBody("Job alert: x")).toBeNull();
    });

    it("returns null for synthesized opportunity echo strings", () => {
      expect(
        formatOpportunityModalBody("Opportunity for Designer at Acme.")
      ).toBeNull();
    });
  });
});

describe("job-description-blocks", () => {
  it("parses hash headings, paragraphs, and bullet lists", () => {
    const blocks = parseJobDescriptionBlocks(
      [
        "### Responsibilities",
        "",
        "You will lead initiatives.",
        "",
        "- First item",
        "- Second item",
        "",
        "Closing paragraph.",
      ].join("\n")
    );
    expect(blocks).toEqual([
      { type: "heading", level: 3, text: "Responsibilities" },
      { type: "paragraph", text: "You will lead initiatives." },
      { type: "list", items: ["First item", "Second item"] },
      { type: "paragraph", text: "Closing paragraph." },
    ]);
  });

  it("promotes **HEADING** and ALL-CAPS labels and implicit duty lines", () => {
    const blocks = parseJobDescriptionBlocks(VIANT_DESCRIPTION);
    const headings = blocks.filter((b) => b.type === "heading").map((b) => b.text);
    expect(headings).toContain("Overview");
    expect(headings.some((h) => /what you/i.test(h))).toBe(true);
    expect(headings.some((h) => /day-?to-?day/i.test(h))).toBe(true);
    expect(headings.some((h) => /great to have/i.test(h))).toBe(true);

    const lists = blocks.filter((b) => b.type === "list");
    expect(lists.length).toBeGreaterThan(0);
    const dutyItems = lists.flatMap((b) => (b.type === "list" ? b.items : []));
    expect(dutyItems.some((i) => /Design and build data processing pipelines/i.test(i))).toBe(
      true
    );
    expect(
      dutyItems.some((i) => /\*\*Experience with Clojure \(required\)\*\*/.test(i))
    ).toBe(true);
  });

  it("linkifies safe http(s) urls only", () => {
    const parts = splitJobDescriptionInline(
      "Apply at https://example.com/jobs/1 and ignore ftp://bad.example/x"
    );
    expect(parts.some((p) => p.type === "link" && p.href === "https://example.com/jobs/1")).toBe(
      true
    );
    expect(parts.some((p) => p.type === "link" && p.href.includes("ftp:"))).toBe(false);
  });

  it("parses bold and italic inline markers", () => {
    const parts = splitJobDescriptionInline(
      "**Experience with Clojure (required)** and distributed systems"
    );
    expect(parts[0]).toEqual({
      type: "bold",
      value: "Experience with Clojure (required)",
    });
    expect(parts.some((p) => p.type === "text" && p.value.includes("distributed"))).toBe(true);
  });

  it("Remolity: peels Company/Role Description into headings with bodies", () => {
    const blocks = parseJobDescriptionBlocks(REMOLITY_DESCRIPTION);
    const headings = blocks.filter((b) => b.type === "heading").map((b) => b.text.toLowerCase());
    expect(headings.some((h) => h.includes("company description"))).toBe(true);
    expect(headings.some((h) => h.includes("role description"))).toBe(true);
    expect(headings.some((h) => h.includes("qualifications"))).toBe(true);

    const paragraphs = blocks.filter((b) => b.type === "paragraph").map((b) => b.text);
    expect(paragraphs.some((p) => /Remolity, Inc\. is a remote job platform/i.test(p))).toBe(true);
    expect(paragraphs.some((p) => /Software Engineer will design/i.test(p))).toBe(true);
    expect(paragraphs.every((p) => !/^Company Description/i.test(p))).toBe(true);
  });
});
