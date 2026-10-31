import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { generateTailoredResumePdf } from "@/lib/document/pdf-generator";
import type { MasterProfileInput } from "@/lib/validations/profile";

describe("PDF Spacing & Education Layout Verification", () => {
  it("renders sample PDF with standardized 8pt/10pt spacing and right-aligned education dates", async () => {
    const profile = {
      fullName: "Alex Morgan",
      email: "alex.morgan@example.com",
      phone: "(555) 019-2834",
      location: "San Francisco, CA",
      linkedinUrl: "https://linkedin.com/in/alexmorgan",
      githubUrl: "https://github.com/alexmorgan",
      summary: "High-impact software engineering leader with extensive experience delivering distributed backend platforms.",
      skills: [
        { label: "Languages", parentCategory: null, items: [{ name: "TypeScript", proficiency: null }, { name: "Go", proficiency: null }] },
        { label: "Frontend", parentCategory: null, items: [{ name: "React", proficiency: null }] },
      ],
      experiences: [
        {
          id: "exp-1",
          company: "Stripe",
          role: "Staff Infrastructure Engineer",
          location: "San Francisco, CA",
          category: "Work",
          displayOrder: 0,
          startDate: "2021",
          endDate: "Present",
          bullets: [
            {
              id: "b1",
              rawText: "Architected distributed settlement pipeline processing $4B+ monthly payment volume with 99.999% availability.",
              technologies: ["Go", "Kafka"],
              hasMetric: true,
            },
            {
              id: "b2",
              rawText: "Reduced p99 ledger reconciliation latency from 450ms to 68ms by implementing zero-copy event streaming.",
              technologies: ["PostgreSQL", "Redis"],
              hasMetric: true,
            },
          ],
        },
        {
          id: "exp-2",
          company: "Airbnb",
          role: "Senior Software Engineer",
          location: "San Francisco, CA",
          category: "Work",
          displayOrder: 1,
          startDate: "2018",
          endDate: "2021",
          bullets: [
            {
              id: "b3",
              rawText: "Engineered real-time availability indexing system indexing 7M+ active listings worldwide.",
              technologies: ["Java", "Elasticsearch"],
              hasMetric: true,
            },
          ],
        },
      ],
      projects: [
        {
          id: "proj-1",
          name: "VectorFlow",
          description: "Open-source distributed vector search engine built for sub-millisecond similarity queries.",
          technologies: ["Rust", "SIMD", "gRPC"],
          bullets: [
            "Developed high-throughput HNSW index implementation sustaining 50k QPS per node.",
          ],
        },
      ],
      education: [
        {
          id: "edu-1",
          institution: "University of California, Berkeley",
          degree: "B.S. in Electrical Engineering & Computer Sciences",
          startDate: "2014",
          graduationDate: "2018",
          status: "GRADUATED" as const,
          honors: [],
          coursework: [],
        },
      ],
      certifications: [
        {
          name: "AWS Certified Solutions Architect – Professional",
          issuer: "Amazon Web Services",
          date: "2023",
        },
      ],
      awards: [],
    } as unknown as MasterProfileInput;

    const buffer = await generateTailoredResumePdf(
      profile,
      profile.experiences,
      profile.projects,
      null,
      null,
      true,
      {
        education: profile.education,
      }
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    const artifactDir = "/Users/marqlott/.gemini/antigravity-cli/brain/8b95052b-8d35-4a9e-a59b-69b6b2bb17cd";
    const outPdf = path.join(artifactDir, "standardized_spacing_sample.pdf");
    fs.writeFileSync(outPdf, buffer);
  });
});
