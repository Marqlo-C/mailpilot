import { randomUUID } from "crypto";

import { z } from "zod";

import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import {
  buildResumeContactLine,
  cleanProjectUrl,
  formatEducationDates,
  formatEducationTitle,
  formatExperienceHeading,
  formatSchoolName,
  getProjectBaseName,
  isAuthenticContactItem,
  normalizeProjectName,
  sanitizeResumeContactLine,
} from "@/lib/utils/format";
import type { TailorResult } from "@/lib/resume-tailor";
import {
  tailoredResumeDraftSchema,
  type ResumeDraftNode,
  type SkillGroup,
  type TailoredResumeDraft,
} from "@/lib/types/resume-draft";
import {
  readEducationStatus,
  type MasterProfileInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";
import type { AccountRules } from "@/lib/validations/rules";
import type { CandidatePersona } from "@/lib/persona/schema.ssot";
import {
  resolveResumeDraftLens,
  sortExperiencesReverseChronological,
} from "@/lib/resume-draft/lens";
import type { ResumeExportConfig } from "@/lib/resume-draft/schema.ssot";
import {
  skillCategoryLabel,
  skillGroupsFromUnknown,
} from "@/lib/skill-groups";

export * from "./resume-draft/schema.ssot";
export * from "./resume-draft/lens";
export * from "./resume-draft/budget";
export {
  cleanProjectUrl,
  getProjectBaseName,
  isAuthenticContactItem,
  isAuthenticLocation,
  normalizeProjectName,
  sanitizeResumeContactLine,
} from "@/lib/utils/format";

function node(
  partial: Omit<ResumeDraftNode, "selected"> & { selected?: boolean }
): ResumeDraftNode {
  return { selected: true, ...partial };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Turn a tailor result plus the master profile into a line-addressable draft.
 * Does not render a PDF.
 */
export function digestTailoredResume(input: {
  opportunityId: string;
  profile: MasterProfileInput;
  tailored: TailorResult;
  includeSummary: boolean;
  persona?: CandidatePersona | null;
  rules?: Partial<AccountRules> | null;
  exportOverrides?: Partial<ResumeExportConfig> | null;
}): TailoredResumeDraft {
  const {
    opportunityId,
    profile,
    tailored,
    includeSummary,
    persona,
    rules,
    exportOverrides,
  } = input;

  const resolved = resolveResumeDraftLens({
    profile,
    persona,
    rules,
    draftOverrides: {
      includeSummary,
      ...exportOverrides,
    },
  });

  const nodes: ResumeDraftNode[] = [];

  // Contact header always sits at the top of the resume
  nodes.push(
    node({
      id: `header:${opportunityId}`,
      type: "header",
      section: "contact",
      content: profile.fullName,
      metadata: {
        contactLine: sanitizeResumeContactLine(buildResumeContactLine(profile)),
      },
    })
  );

  const tailoredGroups = skillGroupsFromUnknown(tailored.tailoredSkills);
  const skillGroups =
    tailoredGroups.length > 0
      ? tailoredGroups
      : skillGroupsFromUnknown(profile.skills);

  const experiences =
    tailored.selectedExperience.length > 0
      ? sortExperiencesReverseChronological(tailored.selectedExperience)
      : resolved.profile.experiences;

  const projects = tailored.selectedProjects;
  const education = resolved.profile.education;
  const summary = tailored.tailoredSummary?.trim() || profile.summary?.trim() || "";

  // Append sections strictly following resolved.sectionOrder
  for (const section of resolved.sectionOrder) {
    switch (section) {
      case "summary": {
        if (resolved.includeSummary && summary) {
          nodes.push(
            node({
              id: `summary:${opportunityId}`,
              type: "summary",
              section: "summary",
              content: summary,
            })
          );
        }
        break;
      }

      case "skills": {
        skillGroups.forEach((group, index) => {
          const content = group.items.map((item) => item.name).join(", ");
          const slug =
            group.label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") || `group-${index}`;
          nodes.push(
            node({
              id: `skills:${slug}:${index}:${opportunityId}`,
              type: "skill_group",
              section: "skills",
              content,
              metadata: {
                categoryLabel: group.label,
                parentCategory: group.parentCategory ?? null,
              },
            })
          );
        });
        break;
      }

      case "projects": {
        projects.forEach((project, index) => {
          const headerId = `proj:${project.id ?? index}:${opportunityId}`;
          nodes.push(
            node({
              id: headerId,
              type: "project_header",
              section: "projects",
              content: normalizeProjectName(project.name),
              metadata: {
                description: project.description,
                technologies: project.technologies,
                link: project.link ?? null,
              },
            })
          );
          const bullets =
            project.bullets.length > 0
              ? project.bullets
              : project.description
                ? [project.description]
                : [];
          bullets.forEach((text, bulletIndex) => {
            nodes.push(
              node({
                id: `proj-bullet:${bulletIndex}:${headerId}`,
                type: "project_bullet",
                section: "projects",
                parentId: headerId,
                content: text,
              })
            );
          });
        });
        break;
      }

      case "experience": {
        experiences.forEach((exp, index) => {
          const headerId = `exp:${exp.id ?? index}:${opportunityId}`;
          nodes.push(
            node({
              id: headerId,
              type: "experience_header",
              section: "experience",
              content: formatExperienceHeading(exp.role, exp.company, exp.location),
              metadata: {
                company: exp.company,
                role: exp.role,
                location: exp.location ?? null,
                category: exp.category || "Work",
                startDate: exp.startDate,
                endDate: exp.endDate ?? null,
                displayOrder: exp.displayOrder ?? index,
              },
            })
          );
          exp.bullets.forEach((bullet, bulletIndex) => {
            nodes.push(
              node({
                id: `exp-bullet:${bullet.id || bulletIndex}:${headerId}`,
                type: "experience_bullet",
                section: "experience",
                parentId: headerId,
                content: bullet.rawText,
                metadata: {
                  bulletId: bullet.id,
                  technologies: bullet.technologies,
                  hasMetric: bullet.hasMetric,
                },
              })
            );
          });
        });
        break;
      }

      case "education": {
        education.forEach((ed, index) => {
          const degree = formatEducationTitle(ed.degree, ed.fieldOfStudy);
          const school = formatSchoolName(ed.institution, ed.subSchool);
          nodes.push(
            node({
              id: `edu:${ed.id ?? index}:${opportunityId}`,
              type: "education_item",
              section: "education",
              content: `${[degree, school].filter(Boolean).join(" — ")}${
                formatEducationDates(ed) ? ` (${formatEducationDates(ed)})` : ""
              }`,
              metadata: {
                institution: ed.institution,
                subSchool: ed.subSchool ?? null,
                degree: ed.degree,
                fieldOfStudy: ed.fieldOfStudy ?? null,
                startDate: ed.startDate ?? null,
                graduationDate: ed.graduationDate ?? null,
                status: ed.status ?? "GRADUATED",
              },
            })
          );
        });
        break;
      }

      case "certifications": {
        profile.certifications.forEach((item, index) => {
          const detail = [item.issuer, item.date].filter(Boolean).join(" · ");
          nodes.push(
            node({
              id: `cert:${index}:${opportunityId}`,
              type: "certification_item",
              section: "certifications",
              content: detail ? `${item.name} — ${detail}` : item.name,
              metadata: {
                name: item.name,
                issuer: item.issuer ?? null,
                date: item.date ?? null,
                url: item.url ?? null,
              },
            })
          );
        });
        break;
      }

      case "awards": {
        profile.awards.forEach((item, index) => {
          const detail = [item.issuer, item.date].filter(Boolean).join(" · ");
          const headline = detail ? `${item.title} — ${detail}` : item.title;
          nodes.push(
            node({
              id: `award:${index}:${opportunityId}`,
              type: "award_item",
              section: "awards",
              content: item.description ? `${headline}. ${item.description}` : headline,
              metadata: {
                title: item.title,
                issuer: item.issuer ?? null,
                date: item.date ?? null,
                description: item.description ?? null,
              },
            })
          );
        });
        break;
      }

      case "interests": {
        profile.interests.forEach((interest, index) => {
          nodes.push(
            node({
              id: `interest:${index}:${opportunityId}`,
              type: "interest_item",
              section: "interests",
              content: interest,
            })
          );
        });
        break;
      }
    }
  }

  return tailoredResumeDraftSchema.parse({
    opportunityId,
    nodes,
    exportConfig: {
      includeSummary: resolved.includeSummary,
      pageBudget: resolved.pageBudget,
      sectionOrder: resolved.sectionOrder,
      disabledSections: resolved.disabledSections,
      orderingMode: resolved.orderingMode,
      inclusionMode: resolved.inclusionMode,
      inventMetrics: resolved.inventMetrics,
      warningFlags: tailored.warningFlags ?? [],
    },
    updatedAt: new Date().toISOString(),
  });
}

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

function splitList(content: string): string[] {
  return content
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Rebuild the structures the PDF renderer already understands. */
export function draftToPdfInput(
  draft: TailoredResumeDraft,
  profile?: MasterProfileInput | null
): {
  headerName: string;
  contactLine: string;
  experiences: WorkExperienceInput[];
  projects: ProjectInput[];
  tailoredSummary: string | null;
  skillGroups: SkillGroup[];
  includeSummary: boolean;
  education: MasterProfileInput["education"];
  certifications: MasterProfileInput["certifications"];
  awards: MasterProfileInput["awards"];
  interests: MasterProfileInput["interests"];
  sectionOrder?: string[] | null;
  disabledSections?: string[] | null;
  warningFlags?: string[];
} {
  const active = activeResumeNodes(draft);
  const header = active.find((item) => item.type === "header");
  const summary = active.find((item) => item.type === "summary");
  const skillGroups = active
    .filter((item) => item.type === "skill_group")
    .flatMap((group) => {
      const items = splitList(group.content);
      if (items.length === 0) return [];
      return [
        {
          label: skillCategoryLabel(group) ?? "",
          parentCategory: asString(group.metadata?.parentCategory) || null,
          items: items.map((name) => ({ name, proficiency: null })),
        },
      ];
    });

  const experiences: WorkExperienceInput[] = [];
  for (const headerNode of active.filter(
    (item) => item.type === "experience_header"
  )) {
    const bullets = active.filter(
      (item) =>
        item.type === "experience_bullet" && item.parentId === headerNode.id
    );
    const parts = headerNode.content.split(" · ");
    const role =
      parts[0]?.trim() || asString(headerNode.metadata?.role) || headerNode.content;
    const company =
      asString(headerNode.metadata?.company) ||
      (parts.length > 1 ? parts[1]?.trim() ?? "" : "");
    experiences.push({
      id: headerNode.id,
      company: company || role,
      role,
      location: asString(headerNode.metadata?.location) || null,
      category: asString(headerNode.metadata?.category) || "Work",
      startDate: asString(headerNode.metadata?.startDate) || "—",
      endDate: asString(headerNode.metadata?.endDate) || null,
      displayOrder: Number(headerNode.metadata?.displayOrder ?? experiences.length),
      bullets: bullets.map((bullet) => ({
        id: bullet.id,
        rawText: bullet.content,
        technologies: Array.isArray(bullet.metadata?.technologies)
          ? bullet.metadata.technologies.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
        hasMetric: bullet.metadata?.hasMetric === true,
      })),
    });
  }

  const projects: ProjectInput[] = [];
  for (const headerNode of active.filter((item) => item.type === "project_header")) {
    const bullets = active
      .filter(
        (item) =>
          item.type === "project_bullet" && item.parentId === headerNode.id
      )
      .map((item) => item.content);
    const rawLink = asString(headerNode.metadata?.link);
    const link = rawLink ? cleanProjectUrl(rawLink) : null;
    projects.push({
      id: headerNode.id,
      name: normalizeProjectName(headerNode.content),
      description: asString(headerNode.metadata?.description),
      technologies: Array.isArray(headerNode.metadata?.technologies)
        ? headerNode.metadata.technologies.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
      link: link || null,
      bullets,
    });
  }

  const certifications = active
    .filter((item) => item.type === "certification_item")
    .map((item) => ({
      name: asString(item.metadata?.name) || item.content,
      issuer: asString(item.metadata?.issuer) || null,
      date: asString(item.metadata?.date) || null,
      url: asString(item.metadata?.url) || null,
    }));

  const awards = active
    .filter((item) => item.type === "award_item")
    .map((item) => ({
      title: asString(item.metadata?.title) || item.content,
      issuer: asString(item.metadata?.issuer) || null,
      date: asString(item.metadata?.date) || null,
      description: asString(item.metadata?.description) || null,
    }));

  const interests = active
    .filter((item) => item.type === "interest_item")
    .map((item) => item.content.trim())
    .filter(Boolean);

  const education = active
    .filter((item) => item.type === "education_item")
    .map((item) => ({
      id: item.id,
      institution: asString(item.metadata?.institution),
      subSchool: asString(item.metadata?.subSchool) || null,
      degree: asString(item.metadata?.degree) || null,
      fieldOfStudy: asString(item.metadata?.fieldOfStudy) || null,
      startDate: asString(item.metadata?.startDate) || null,
      graduationDate: asString(item.metadata?.graduationDate) || null,
      status: readEducationStatus(item.metadata?.status),
      honors: [],
      coursework: [],
    }));

  return {
    headerName: header?.content.trim() || profile?.fullName || "",
    contactLine: sanitizeResumeContactLine(
      asString(header?.metadata?.contactLine) ||
        (profile ? buildResumeContactLine(profile) : "")
    ),
    experiences,
    projects,
    tailoredSummary: summary?.content.trim() || null,
    skillGroups,
    includeSummary:
      draft.exportConfig.includeSummary && Boolean(summary?.content.trim()),
    education,
    certifications,
    awards,
    interests,
    sectionOrder: draft.exportConfig.sectionOrder ?? null,
    disabledSections: draft.exportConfig.disabledSections ?? null,
    warningFlags: draft.exportConfig.warningFlags ?? [],
  };
}

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

const refineLineSchema = z.object({
  content: z.string().min(1),
});

/**
 * Rewrite one node. The model only sees that line plus the instruction.
 */
export async function refineResumeLine(input: {
  content: string;
  instruction: string;
  llmProvider: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  allowCloudFallback?: boolean;
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
}): Promise<string> {
  const instruction = input.instruction.trim();
  if (!instruction) {
    throw new Error("Refinement instruction is required");
  }
  const result = await callLLMWithFallback({
    llmProvider: input.llmProvider,
    localOllamaUrl: input.localOllamaUrl,
    ollamaModel: input.ollamaModel,
    allowCloudFallback: input.allowCloudFallback,
    accountId: input.accountId,
    accountRules: input.accountRules,
    systemPrompt:
      "You edit one resume line. Return JSON {\"content\":\"...\"} containing only the rewritten line. Do not add bullets, headings, or extra sentences.",
    userPrompt: `Instruction: ${instruction}\nLine: ${input.content}`,
  });
  const parsed = refineLineSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error("The model did not return a single rewritten line");
  }
  return parsed.data.content.trim();
}

export function touchDraft(draft: TailoredResumeDraft): TailoredResumeDraft {
  return { ...draft, updatedAt: new Date().toISOString() };
}

export function newNodeId(): string {
  return randomUUID();
}
