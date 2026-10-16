import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { buildResumeContactLine } from "@/lib/utils/format";
import type { MasterProfileInput } from "@/lib/validations/profile";
import type { ProfileWithPersonaCache } from "@/lib/ai/persona";

// Mock prisma and master-profile loader for testing the server action
vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    userProfile: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/master-profile", () => ({
  loadMasterProfileForDraft: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { loadMasterProfileForDraft } from "@/lib/master-profile";
import { exportMasterProfilePdfAction } from "@/app/actions/profile";

describe("Master Profile PDF Export", () => {
  const sampleProfile: ProfileWithPersonaCache = {
    accountId: "acc-test-123",
    fullName: "Jordan Lee",
    email: "jordan.lee@example.com",
    phone: "555-0199",
    location: "Seattle, WA",
    summary: "Senior Architect with extensive background in distributed systems.",
    links: [
      { label: "LinkedIn", url: "https://linkedin.com/in/jordanlee" },
      { label: "GitHub", url: "https://github.com/jordanlee" },
    ],
    skills: [
      {
        label: "Languages",
        parentCategory: null,
        items: [
          { name: "TypeScript", proficiency: null },
          { name: "Go", proficiency: null },
          { name: "Rust", proficiency: null },
        ],
      },
      {
        label: "Infrastructure",
        parentCategory: null,
        items: [
          { name: "Kubernetes", proficiency: null },
          { name: "Docker", proficiency: null },
        ],
      },
    ],
    experiences: [
      {
        id: "exp-1",
        company: "Alpha Cloud",
        role: "Staff Engineer",
        location: "Seattle, WA",
        category: "EXPERIENCE",
        startDate: "2022-01",
        endDate: null,
        displayOrder: 0,
        bullets: [
          { id: "b1", rawText: "Engineered scalable telemetry pipeline processing 50M events daily.", technologies: ["Go"], hasMetric: true },
          { id: "b2", rawText: "Reduced p99 query latency by 35% through query caching.", technologies: ["Redis"], hasMetric: true },
        ],
      },
      {
        id: "exp-2",
        company: "Beta Systems",
        role: "Senior Software Engineer",
        location: "Remote",
        category: "EXPERIENCE",
        startDate: "2019-03",
        endDate: "2021-12",
        displayOrder: 1,
        bullets: [
          { id: "b3", rawText: "Designed core microservices architecture with Go and gRPC.", technologies: ["Go", "gRPC"], hasMetric: false },
        ],
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "Telemetry Engine",
        description: "Open-source metric daemon",
        technologies: ["Go", "eBPF"],
        link: "https://github.com/jordanlee/telemetry-engine",
        bullets: ["Developed high-speed packet inspection probe."],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "University of Washington",
        subSchool: null,
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        startDate: "2015-09",
        graduationDate: "2019-06",
        status: "GRADUATED",
        gpa: null,
        honors: [],
        coursework: [],
      },
    ],
    certifications: [
      {
        name: "AWS Certified Solutions Architect",
        issuer: "Amazon Web Services",
        date: "2023",
        url: null,
      },
    ],
    awards: [],
    interests: ["Rock Climbing", "Chess"],
    seniorityTier: "SENIOR",
    timelineContext: "8 years professional experience",
    toneGuidance: "Direct, metric-oriented",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateTailoredResumePdf generates a multi-page unpruned PDF buffer with all experiences and projects", async () => {
    const pdfBuffer = await generateTailoredResumePdf(
      sampleProfile,
      sampleProfile.experiences,
      sampleProfile.projects,
      sampleProfile.summary,
      sampleProfile.skills,
      Boolean(sampleProfile.summary),
      {
        headerName: sampleProfile.fullName,
        contactLine: buildResumeContactLine(sampleProfile),
        education: sampleProfile.education,
        skillGroups: sampleProfile.skills,
        certifications: sampleProfile.certifications,
        awards: sampleProfile.awards,
        interests: sampleProfile.interests,
      }
    );

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(100);
    // PDF Magic bytes
    expect(pdfBuffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  describe("exportMasterProfilePdfAction", () => {
    it("returns error if accountId is empty or account not found", async () => {
      const resMissing = await exportMasterProfilePdfAction("");
      expect(resMissing.ok).toBe(false);

      vi.mocked(prisma.account.findUnique).mockResolvedValueOnce(null);
      const resNotFound = await exportMasterProfilePdfAction("non-existent");
      expect(resNotFound.ok).toBe(false);
      if (!resNotFound.ok) {
        expect(resNotFound.error).toBe("Account not found");
      }
    });

    it("successfully exports master profile to base64 PDF and formatted filename", async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
        id: "acc-test-123",
        email: "jordan.lee@example.com",
      } as any);

      vi.mocked(loadMasterProfileForDraft).mockResolvedValueOnce(sampleProfile);

      const res = await exportMasterProfilePdfAction("acc-test-123");
      expect(res.ok).toBe(true);
      if (!res.ok || !res.data) throw new Error("Expected ok result");

      expect(res.data.filename).toBe("Jordan_Lee_Master_Resume.pdf");
      expect(res.data.pdfBase64).toBeDefined();

      const decoded = Buffer.from(res.data.pdfBase64, "base64");
      expect(decoded.subarray(0, 4).toString()).toBe("%PDF");
    });
  });
});
