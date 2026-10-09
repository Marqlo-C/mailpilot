import { randomUUID } from "crypto";

import { z } from "zod";

import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import { formatEducationTitle, formatSchoolName } from "@/lib/utils/format";
import type { TailorResult } from "@/lib/resume-tailor";
import {
  tailoredResumeDraftSchema,
  type ResumeDraftNode,
  type SkillGroup,
  type TailoredResumeDraft,
} from "@/lib/types/resume-draft";
import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import { buildResumeContactLine } from "@/lib/pdf-generator";
import {
  skillCategoryLabel,
  skillGroupsFromUnknown,
} from "@/lib/skill-groups";

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
}): TailoredResumeDraft {
  const { opportunityId, profile, tailored, includeSummary } = input;
  const nodes: ResumeDraftNode[] = [];

  nodes.push(
    node({
      id: `header:${opportunityId}`,
      type: "header",
      section: "contact",
      content: profile.fullName,
      metadata: { contactLine: buildResumeContactLine(profile) },
    })
  );

  const summary = tailored.tailoredSummary?.trim() || profile.summary?.trim() || "";
  if (includeSummary && summary) {
    nodes.push(
      node({
        id: `summary:${opportunityId}`,
        type: "summary",
        section: "summary",
        content: summary,
      })
    );
  }

  const tailoredGroups = skillGroupsFromUnknown(tailored.tailoredSkills);
  const skillGroups =
    tailoredGroups.length > 0
      ? tailoredGroups
      : skillGroupsFromUnknown(profile.skills);
  skillGroups.forEach((group, index) => {
    const content = group.items.join(", ");
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
        metadata: { categoryLabel: group.label },
      })
    );
  });

  const experiences =
    tailored.selectedExperience.length > 0
      ? tailored.selectedExperience
      : profile.experiences;

  experiences.forEach((exp, index) => {
    const headerId = `exp:${exp.id ?? index}:${opportunityId}`;
    nodes.push(
      node({
        id: headerId,
        type: "experience_header",
        section: "experience",
        content: `${exp.role} · ${exp.company}`,
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

  tailored.selectedProjects.forEach((project, index) => {
    const headerId = `proj:${project.id ?? index}:${opportunityId}`;
    nodes.push(
      node({
        id: headerId,
        type: "project_header",
        section: "projects",
        content: project.name,
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

  profile.education.forEach((ed, index) => {
    const degree = formatEducationTitle(ed.degree, ed.fieldOfStudy);
    const school = formatSchoolName(ed.institution, ed.subSchool);
    nodes.push(
      node({
        id: `edu:${ed.id ?? index}:${opportunityId}`,
        type: "education_item",
        section: "education",
        content: `${degree} — ${school}${
          ed.graduationDate ? ` (${ed.graduationDate})` : ""
        }`,
        metadata: {
          institution: ed.institution,
          subSchool: ed.subSchool ?? null,
          degree: ed.degree,
          fieldOfStudy: ed.fieldOfStudy ?? null,
          graduationDate: ed.graduationDate ?? null,
        },
      })
    );
  });

  return tailoredResumeDraftSchema.parse({
    opportunityId,
    nodes,
    exportConfig: { includeSummary, pageBudget: "auto" },
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
          items,
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
      parts.length > 1 ? parts.slice(1).join(" · ").trim() : "";
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
    projects.push({
      id: headerNode.id,
      name: headerNode.content,
      description: asString(headerNode.metadata?.description),
      technologies: Array.isArray(headerNode.metadata?.technologies)
        ? headerNode.metadata.technologies.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
      link: asString(headerNode.metadata?.link) || null,
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
      graduationDate: asString(item.metadata?.graduationDate) || null,
      honors: [],
    }));

  return {
    headerName: header?.content.trim() || profile?.fullName || "",
    contactLine:
      asString(header?.metadata?.contactLine) ||
      (profile ? buildResumeContactLine(profile) : ""),
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
