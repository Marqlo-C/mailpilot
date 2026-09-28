import type {
  MasterProfileInput,
  ProjectInput,
  Skills,
  WorkExperienceInput,
} from "@/lib/validations/profile";

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ensureAbsoluteUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Extracts and normalizes platform profile URLs from links.
 */
export function extractPlatformLinks(
  links: { label: string; url: string }[]
): {
  linkedWebsite: string | null;
  linkedLinkedin: string | null;
  linkedGithub: string | null;
  linkedIndeed: string | null;
  linkedGlassdoor: string | null;
  linkedHandshake: string | null;
} {
  let linkedWebsite: string | null = null;
  let linkedLinkedin: string | null = null;
  let linkedGithub: string | null = null;
  let linkedIndeed: string | null = null;
  let linkedGlassdoor: string | null = null;
  let linkedHandshake: string | null = null;

  for (const item of links) {
    const url = ensureAbsoluteUrl(item.url);
    if (!url) continue;

    const lower = url.toLowerCase();
    const label = item.label.toLowerCase();

    if (lower.includes("linkedin.com/in/") || lower.includes("linkedin.com/pub/")) {
      linkedLinkedin = url;
    } else if (
      lower.includes("github.com/") &&
      !lower.includes("github.io")
    ) {
      linkedGithub = url;
    } else if (lower.includes("indeed.com")) {
      linkedIndeed = url;
    } else if (lower.includes("glassdoor.com")) {
      linkedGlassdoor = url;
    } else if (
      lower.includes("joinhandshake.com") ||
      lower.includes("handshake.com")
    ) {
      linkedHandshake = url;
    } else if (
      lower.includes("github.io") ||
      lower.includes("portfolio") ||
      label.includes("portfolio") ||
      label.includes("website") ||
      label.includes("personal")
    ) {
      linkedWebsite = url;
    }
  }

  return {
    linkedWebsite,
    linkedLinkedin,
    linkedGithub,
    linkedIndeed,
    linkedGlassdoor,
    linkedHandshake,
  };
}

/**
 * Pulls profile URLs out of free-form resume text and merges them into links[].
 */
export function enrichLinksFromRawText(
  text: string,
  existingLinks: { label: string; url: string }[]
): { label: string; url: string }[] {
  const found: { label: string; url: string }[] = [];
  const patterns: Array<{ re: RegExp; label: string }> = [
    {
      re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9._%/-]+/gi,
      label: "LinkedIn",
    },
    {
      re: /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9._-]+\/?/gi,
      label: "GitHub",
    },
    {
      re: /https?:\/\/[A-Za-z0-9._-]+\.github\.io\/?/gi,
      label: "Portfolio",
    },
    {
      re: /https?:\/\/(?:www\.)?indeed\.com\/[^\s)]+/gi,
      label: "Indeed",
    },
    {
      re: /https?:\/\/(?:www\.)?glassdoor\.com\/[^\s)]+/gi,
      label: "Glassdoor",
    },
    {
      re: /https?:\/\/(?:www\.)?(?:join)?handshake\.com\/[^\s)]+/gi,
      label: "Handshake",
    },
  ];

  for (const { re, label } of patterns) {
    for (const match of text.matchAll(re)) {
      const url = match[0]?.replace(/[.,;:]+$/, "") ?? "";
      if (!url) continue;
      // Skip repo deep-links for GitHub — keep profile roots only.
      if (label === "GitHub") {
        try {
          const parsed = new URL(url);
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length !== 1) continue;
          found.push({
            label,
            url: `https://github.com/${parts[0]}`,
          });
          continue;
        } catch {
          continue;
        }
      }
      found.push({ label, url });
    }
  }

  const seen = new Set(
    existingLinks.map((l) => ensureAbsoluteUrl(l.url).toLowerCase())
  );
  const merged = [...existingLinks];
  for (const item of found) {
    const key = ensureAbsoluteUrl(item.url).toLowerCase();
    if (!seen.has(key)) {
      merged.push({ label: item.label, url: ensureAbsoluteUrl(item.url) });
      seen.add(key);
    }
  }
  return merged;
}

/** Resolves a GitHub username from an optional handle or detected profile URL. */
export function resolveGithubHandle(
  explicitHandleOrUrl: string | null | undefined,
  links: { label: string; url: string }[]
): string | null {
  const explicit = explicitHandleOrUrl?.trim();
  if (explicit) return explicit;

  const platforms = extractPlatformLinks(links);
  if (platforms.linkedGithub) return platforms.linkedGithub;

  return null;
}

/**
 * Merges skills arrays using case-insensitive set unions.
 */
function mergeSkillBuckets(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const s of existing) {
    const key = normalizeString(s);
    if (key) map.set(key, s);
  }
  for (const s of incoming) {
    const key = normalizeString(s);
    if (key && !map.has(key)) map.set(key, s);
  }
  return Array.from(map.values());
}

/**
 * Consolidates incoming profile data with existing profile data additively.
 */
export function consolidateProfiles(
  existing: MasterProfileInput,
  incoming: MasterProfileInput
): MasterProfileInput {
  const skills: Skills = {
    languages: mergeSkillBuckets(
      existing.skills.languages,
      incoming.skills.languages
    ),
    frameworks: mergeSkillBuckets(
      existing.skills.frameworks,
      incoming.skills.frameworks
    ),
    tools: mergeSkillBuckets(existing.skills.tools, incoming.skills.tools),
    concepts: mergeSkillBuckets(
      existing.skills.concepts,
      incoming.skills.concepts
    ),
  };

  const experiences: WorkExperienceInput[] = [...existing.experiences];

  for (const incExp of incoming.experiences) {
    const incCompanyNorm = normalizeString(incExp.company);
    const existingIndex = experiences.findIndex((e) => {
      const eCompanyNorm = normalizeString(e.company);
      if (!eCompanyNorm || !incCompanyNorm) return false;
      return (
        eCompanyNorm === incCompanyNorm ||
        eCompanyNorm.includes(incCompanyNorm) ||
        incCompanyNorm.includes(eCompanyNorm)
      );
    });

    if (existingIndex >= 0) {
      const match = experiences[existingIndex]!;
      const existingBulletTexts = new Set(
        match.bullets.map((b) => normalizeString(b.rawText))
      );
      const newBullets = incExp.bullets.filter(
        (b) => !existingBulletTexts.has(normalizeString(b.rawText))
      );

      experiences[existingIndex] = {
        ...match,
        role: match.role || incExp.role,
        startDate: match.startDate || incExp.startDate,
        endDate: match.endDate ?? incExp.endDate,
        bullets: [...match.bullets, ...newBullets],
      };
    } else {
      experiences.push({
        ...incExp,
        displayOrder: experiences.length,
      });
    }
  }

  const projects: ProjectInput[] = [...existing.projects];

  for (const incProj of incoming.projects) {
    const incNameNorm = normalizeString(incProj.name);
    const existingIndex = projects.findIndex(
      (p) =>
        normalizeString(p.name) === incNameNorm ||
        (Boolean(p.link) &&
          Boolean(incProj.link) &&
          (p.link ?? "").toLowerCase() === (incProj.link ?? "").toLowerCase())
    );

    if (existingIndex >= 0) {
      const match = projects[existingIndex]!;
      const existingBullets = new Set(
        match.bullets.map((b) => normalizeString(b))
      );
      const newBullets = incProj.bullets.filter(
        (b) => !existingBullets.has(normalizeString(b))
      );

      projects[existingIndex] = {
        ...match,
        description: match.description || incProj.description,
        technologies: mergeSkillBuckets(
          match.technologies,
          incProj.technologies
        ),
        link: match.link || incProj.link,
        bullets: [...match.bullets, ...newBullets],
      };
    } else {
      projects.push(incProj);
    }
  }

  const education = [...existing.education];
  for (const incEd of incoming.education) {
    const incInstNorm = normalizeString(incEd.institution);
    const existingIndex = education.findIndex(
      (e) => normalizeString(e.institution) === incInstNorm
    );

    if (existingIndex >= 0) {
      const match = education[existingIndex]!;
      education[existingIndex] = {
        ...match,
        degree: match.degree || incEd.degree,
        fieldOfStudy: match.fieldOfStudy || incEd.fieldOfStudy,
        graduationDate: match.graduationDate || incEd.graduationDate,
      };
    } else {
      education.push(incEd);
    }
  }

  const linkUrls = new Set(
    existing.links.map((l) => ensureAbsoluteUrl(l.url).toLowerCase())
  );
  const mergedLinks = [...existing.links];
  for (const l of incoming.links) {
    const key = ensureAbsoluteUrl(l.url).toLowerCase();
    if (!linkUrls.has(key)) {
      mergedLinks.push({ ...l, url: ensureAbsoluteUrl(l.url) });
      linkUrls.add(key);
    }
  }

  return {
    fullName: incoming.fullName || existing.fullName,
    email: incoming.email || existing.email,
    phone: incoming.phone ?? existing.phone,
    location: incoming.location ?? existing.location,
    summary: incoming.summary ?? existing.summary,
    links: mergedLinks,
    skills,
    experiences,
    projects,
    education,
  };
}
