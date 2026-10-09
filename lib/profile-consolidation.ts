import type {
  AwardItem,
  CertificationItem,
  MasterProfileInput,
  Skills,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import {
  accountLabelForUrl,
  categorizeProfileUrl,
  extractProfileLinksFromText,
  githubProfileRoot,
  githubProfileUrlInText,
  isGithubProfileUrl,
  isVerifiedProfileUrl,
  normalizeProfileUrl,
} from "@/lib/utils/url";

/** True when an address is missing or a synthetic placeholder. */
export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return true;
  const lower = email.trim().toLowerCase();
  return (
    lower === "" ||
    lower.includes("example.com") ||
    lower.includes("unknown@") ||
    lower.includes("placeholder") ||
    lower.includes("mailpilot.local")
  );
}

function preferPopulated(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  const current = existing?.trim() ?? "";
  if (current) return current;
  const next = incoming?.trim() ?? "";
  return next || null;
}

function mergeCertifications(
  existing: CertificationItem[],
  incoming: CertificationItem[]
): CertificationItem[] {
  const certMap = new Map<string, CertificationItem>();
  for (const item of existing) {
    const key = item.name.trim().toLowerCase();
    if (!key) continue;
    certMap.set(key, { ...item });
  }
  for (const item of incoming) {
    const key = item.name.trim().toLowerCase();
    if (!key) continue;
    const existingItem = certMap.get(key);
    if (existingItem) {
      certMap.set(key, {
        ...existingItem,
        issuer: existingItem.issuer || item.issuer,
        date: existingItem.date || item.date,
        url: existingItem.url || item.url,
      });
    } else {
      certMap.set(key, { ...item });
    }
  }
  return Array.from(certMap.values());
}

function mergeAwards(existing: AwardItem[], incoming: AwardItem[]): AwardItem[] {
  const awardMap = new Map<string, AwardItem>();
  for (const item of existing) {
    const key = item.title.trim().toLowerCase();
    if (!key) continue;
    awardMap.set(key, { ...item });
  }
  for (const item of incoming) {
    const key = item.title.trim().toLowerCase();
    if (!key) continue;
    const existingItem = awardMap.get(key);
    if (existingItem) {
      awardMap.set(key, {
        ...existingItem,
        issuer: existingItem.issuer || item.issuer,
        date: existingItem.date || item.date,
        description: existingItem.description || item.description,
      });
    } else {
      awardMap.set(key, { ...item });
    }
  }
  return Array.from(awardMap.values());
}

function mergeInterests(existing: string[], incoming: string[]): string[] {
  const interestSet = new Set<string>();
  const normalizedInterests: string[] = [];
  for (const interest of [...existing, ...incoming]) {
    const trimmed = interest.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !interestSet.has(key)) {
      interestSet.add(key);
      normalizedInterests.push(trimmed);
    }
  }
  return normalizedInterests;
}

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ensureAbsoluteUrl(raw: string): string {
  const normalized = normalizeProfileUrl(raw);
  return normalized || raw.trim();
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
  let websiteFromPortfolio = false;

  for (const item of links) {
    const url = ensureAbsoluteUrl(item.url);
    if (!url) continue;
    const kind = categorizeProfileUrl(url);
    const label = item.label.toLowerCase();

    if (kind === "linkedin" && /linkedin\.com\/(?:in|pub)\//i.test(url)) {
      linkedLinkedin = url;
    } else if (kind === "github") {
      const root = githubProfileRoot(url);
      if (root) linkedGithub = root;
    } else if (kind === "indeed") {
      linkedIndeed = url;
    } else if (kind === "glassdoor") {
      linkedGlassdoor = url;
    } else if (kind === "handshake") {
      linkedHandshake = url;
    } else if (
      (kind === "portfolio" || label.includes("portfolio")) &&
      isVerifiedProfileUrl(url)
    ) {
      linkedWebsite = url;
      websiteFromPortfolio = true;
    } else if (
      !websiteFromPortfolio &&
      isVerifiedProfileUrl(url) &&
      (kind === "website" ||
        label.includes("website") ||
        label.includes("personal"))
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

  for (const raw of extractProfileLinksFromText(text)) {
    if (!isVerifiedProfileUrl(raw)) continue;
    const kind = categorizeProfileUrl(raw);
    if (kind === "github") {
      const root = githubProfileRoot(raw);
      if (!root) continue;
      found.push({ label: "GitHub", url: root });
      continue;
    }
    if (kind === "linkedin" && !/linkedin\.com\/(?:in|pub)\//i.test(raw)) continue;
    const label = accountLabelForUrl(raw);
    if (label === "Website" && !isVerifiedProfileUrl(raw)) continue;
    found.push({ label, url: normalizeProfileUrl(raw) });
  }

  const keptExisting = existingLinks.filter(
    (item) =>
      item.label.trim().toLowerCase() !== "website" || isVerifiedProfileUrl(item.url)
  );
  const seen = new Set(
    keptExisting.map((l) => ensureAbsoluteUrl(l.url).toLowerCase())
  );
  const merged = [...keptExisting];
  for (const item of found) {
    const key = ensureAbsoluteUrl(item.url).toLowerCase();
    if (!seen.has(key)) {
      merged.push({ label: item.label, url: ensureAbsoluteUrl(item.url) });
      seen.add(key);
    }
  }
  return merged;
}

export { githubProfileUrlInText, isGithubProfileUrl };

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
 * Merges skill groups by label, deduping items case-insensitively.
 */
function mergeSkillGroups(existing: Skills, incoming: Skills): Skills {
  const order: string[] = [];
  const groups = new Map<
    string,
    { label: string; parentCategory: string | null; items: Skills[number]["items"] }
  >();

  for (const group of [...existing, ...incoming]) {
    const parentCategory = group.parentCategory?.trim() || null;
    const key = `${normalizeString(parentCategory ?? "")}\n${normalizeString(group.label)}`;
    if (!normalizeString(group.label)) continue;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        label: group.label.trim(),
        parentCategory,
        items: mergeSkillBuckets([], group.items),
      });
      order.push(key);
      continue;
    }
    current.items = mergeSkillBuckets(current.items, group.items);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    return {
      label: group.label,
      parentCategory: group.parentCategory,
      items: group.items,
    };
  });
}

/**
 * Merges skill names using case-insensitive set unions.
 */
function mergeStringBuckets(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of [...existing, ...incoming]) {
    const key = normalizeString(value);
    if (key && !map.has(key)) map.set(key, value);
  }
  return Array.from(map.values());
}

function mergeSkillBuckets(
  existing: Skills[number]["items"],
  incoming: Skills[number]["items"]
): Skills[number]["items"] {
  const map = new Map<string, Skills[number]["items"][number]>();
  for (const item of [...existing, ...incoming]) {
    const key = normalizeString(item.name);
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, item);
      continue;
    }
    if (!current.proficiency && item.proficiency) {
      map.set(key, { name: current.name, proficiency: item.proficiency });
    }
  }
  return Array.from(map.values());
}

export interface ConsolidationOptions {
  /** When true, incoming data replaces the existing profile instead of merging. */
  overwriteAll?: boolean;
}

/**
 * Consolidates incoming profile data with existing profile data.
 * The default path merges additively. `overwriteAll` replaces the stored profile.
 */
export function consolidateProfiles(
  existing: MasterProfileInput,
  incoming: MasterProfileInput,
  options: ConsolidationOptions = {}
): MasterProfileInput {
  if (options.overwriteAll) {
    return {
      fullName: incoming.fullName?.trim() || "",
      email: !isPlaceholderEmail(incoming.email) ? incoming.email.trim() : "",
      phone: incoming.phone?.trim() || null,
      location: incoming.location?.trim() || null,
      summary: incoming.summary?.trim() || null,
      links: incoming.links ?? [],
      skills: incoming.skills ?? [],
      experiences: incoming.experiences ?? [],
      projects: incoming.projects ?? [],
      education: incoming.education ?? [],
      certifications: incoming.certifications ?? [],
      awards: incoming.awards ?? [],
      interests: incoming.interests ?? [],
    };
  }

  const skills = mergeSkillGroups(existing.skills, incoming.skills);

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
        location: preferPopulated(match.location, incExp.location),
        category: match.category || incExp.category || "Work",
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
        technologies: mergeStringBuckets(
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
    const existingIndex = education.findIndex((e) => {
      if (normalizeString(e.institution) !== normalizeString(incEd.institution)) {
        return false;
      }
      const existingSchool = normalizeString(e.subSchool ?? "");
      const incomingSchool = normalizeString(incEd.subSchool ?? "");
      if (existingSchool && incomingSchool && existingSchool !== incomingSchool) {
        return false;
      }
      const existingDegree = normalizeString(e.degree ?? "");
      const incomingDegree = normalizeString(incEd.degree ?? "");
      if (existingDegree && incomingDegree && existingDegree !== incomingDegree) {
        return false;
      }
      return true;
    });

    if (existingIndex >= 0) {
      const match = education[existingIndex]!;
      education[existingIndex] = {
        ...match,
        degree: match.degree || incEd.degree,
        subSchool: match.subSchool || incEd.subSchool,
        fieldOfStudy: match.fieldOfStudy || incEd.fieldOfStudy,
        startDate: match.startDate || incEd.startDate,
        graduationDate: match.graduationDate || incEd.graduationDate,
        status:
          incEd.status && incEd.status !== "GRADUATED"
            ? incEd.status
            : match.status ?? incEd.status ?? "GRADUATED",
        gpa: match.gpa || incEd.gpa,
        honors: [...(match.honors ?? []), ...(incEd.honors ?? [])].filter(
          (honor, index, list) =>
            list.findIndex((item) => item.toLowerCase() === honor.toLowerCase()) ===
            index
        ),
        coursework: [...(match.coursework ?? []), ...(incEd.coursework ?? [])].filter(
          (course, index, list) =>
            list.findIndex((item) => item.toLowerCase() === course.toLowerCase()) ===
            index
        ),
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

  const email =
    existing.email && !isPlaceholderEmail(existing.email)
      ? existing.email.trim()
      : !isPlaceholderEmail(incoming.email)
        ? incoming.email.trim()
        : "";

  return {
    fullName: preferPopulated(existing.fullName, incoming.fullName) || "Unknown",
    email,
    phone: preferPopulated(existing.phone, incoming.phone),
    location: preferPopulated(existing.location, incoming.location),
    summary: incoming.summary ?? existing.summary,
    links: mergedLinks,
    skills,
    experiences,
    projects,
    education,
    certifications: mergeCertifications(
      existing.certifications ?? [],
      incoming.certifications ?? []
    ),
    awards: mergeAwards(existing.awards ?? [], incoming.awards ?? []),
    interests: mergeInterests(existing.interests ?? [], incoming.interests ?? []),
  };
}
