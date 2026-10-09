import JSZip from "jszip";
import Papa from "papaparse";

import type { MasterProfileInput } from "@/lib/validations/profile";

type CsvRow = Record<string, string | undefined>;

const METRIC_RE = /\d+%|\$\d+|\b\d+\b/;

const LINKEDIN_SKILL_GROUP = "Skills & Endorsements";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `li_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cell(row: CsvRow, ...keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (direct && direct.trim()) return direct.trim();
    const found = Object.entries(row).find(
      ([k]) => k.trim().toLowerCase() === key.trim().toLowerCase()
    );
    if (found?.[1]?.trim()) return found[1].trim();
  }
  return "";
}

function parseCsv(text: string): CsvRow[] {
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return parsed.data ?? [];
}

async function readCsvFromZip(
  zip: JSZip,
  fileName: string
): Promise<CsvRow[]> {
  const target = Object.values(zip.files).find((entry) => {
    if (entry.dir) return false;
    const base = entry.name.split("/").pop()?.toLowerCase() ?? "";
    return base === fileName.toLowerCase();
  });
  if (!target) return [];
  const text = await target.async("string");
  return parseCsv(text);
}

function splitBullets(description: string): Array<{
  id: string;
  rawText: string;
  technologies: string[];
  hasMetric: boolean;
}> {
  const lines = description
    .split(/\r?\n|(?=[•\-\*])/)
    .map((line) => line.replace(/^[•\-\*]+\s*/, "").trim())
    .filter(Boolean);

  if (lines.length === 0 && description.trim()) {
    return [
      {
        id: newId(),
        rawText: description.trim(),
        technologies: [],
        hasMetric: METRIC_RE.test(description),
      },
    ];
  }

  return lines.map((rawText) => ({
    id: newId(),
    rawText,
    technologies: [],
    hasMetric: METRIC_RE.test(rawText),
  }));
}

function addLinkedInSkill(
  groups: Map<string, string[]>,
  label: string,
  name: string
) {
  const key = label.trim() || LINKEDIN_SKILL_GROUP;
  const items = groups.get(key) ?? [];
  if (items.some((item) => item.toLowerCase() === name.toLowerCase())) return;
  items.push(name);
  groups.set(key, items);
}

/**
 * Zero-token LinkedIn Data Archive (.zip) parser → MasterProfileInput.
 */
export async function parseLinkedInArchive(
  buffer: Buffer
): Promise<MasterProfileInput> {
  const zip = await JSZip.loadAsync(buffer);

  const [
    profileRows,
    positionRows,
    educationRows,
    skillRows,
    projectRows,
    certificationRows,
    honorRows,
    extraHonorRows,
    interestRows,
  ] = await Promise.all([
    readCsvFromZip(zip, "Profile.csv"),
    readCsvFromZip(zip, "Positions.csv"),
    readCsvFromZip(zip, "Education.csv"),
    readCsvFromZip(zip, "Skills.csv"),
    readCsvFromZip(zip, "Projects.csv"),
    readCsvFromZip(zip, "Certifications.csv"),
    readCsvFromZip(zip, "Honors.csv"),
    readCsvFromZip(zip, "Honors and Awards.csv"),
    readCsvFromZip(zip, "Interests.csv"),
  ]);

  const profile = profileRows[0] ?? {};
  const firstName = cell(profile, "First Name", "FirstName");
  const lastName = cell(profile, "Last Name", "LastName");
  const fullName = `${firstName} ${lastName}`.trim() || "LinkedIn Member";
  const headline = cell(profile, "Headline");
  const summary =
    cell(profile, "Summary", "About") ||
    (headline ? headline : null);

  const skillBuckets = new Map<string, string[]>();

  for (const row of skillRows) {
    const name = cell(row, "Name", "Skill Name", "Skill");
    if (!name) continue;
    const category = cell(row, "Category", "Skill Category", "Group");
    addLinkedInSkill(skillBuckets, category || LINKEDIN_SKILL_GROUP, name);
  }

  const skills = Array.from(skillBuckets, ([label, items]) => ({
    label,
    items,
  }));

  const experiences = positionRows
    .map((row, index) => {
      const company = cell(row, "Company Name", "Company");
      const role = cell(row, "Title", "Position Title");
      if (!company && !role) return null;
      const description = cell(row, "Description", "Notes");
      return {
        id: newId(),
        company: company || "Unknown Company",
        role: role || "Role",
        location: cell(row, "Location") || null,
        category: "Work",
        startDate: cell(row, "Started On", "Start Date") || "Unknown",
        endDate: cell(row, "Finished On", "End Date") || null,
        bullets: splitBullets(description),
        displayOrder: index,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const education = educationRows
    .map((row) => {
      const institution = cell(row, "School Name", "School");
      const degree = cell(row, "Degree Name", "Degree") || "Degree";
      if (!institution) return null;
      const notes = cell(row, "Notes", "Activities");
      return {
        id: newId(),
        institution,
        subSchool: null,
        degree,
        fieldOfStudy: notes || null,
        startDate: cell(row, "Start Date", "StartDate") || null,
        graduationDate:
          cell(row, "End Date", "EndDate") ||
          cell(row, "Start Date", "StartDate") ||
          null,
        gpa: null,
        honors: [],
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const projects = projectRows
    .map((row) => {
      const name = cell(row, "Title", "Project Title", "Name");
      if (!name) return null;
      return {
        id: newId(),
        name,
        description: cell(row, "Description") || "",
        technologies: [] as string[],
        link: cell(row, "Url", "URL") || null,
        bullets: splitBullets(cell(row, "Description")).map((b) => b.rawText),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const certifications = certificationRows.flatMap((row) => {
    const name = cell(row, "Name", "Certification Name", "Title");
    if (!name) return [];
    return [
      {
        name,
        issuer: cell(row, "Authority", "Issuer", "Issuing Organization") || null,
        date:
          cell(row, "Started On", "StartedOn", "Issue Date", "Date") || null,
        url: cell(row, "Url", "URL") || null,
      },
    ];
  });

  const awards = [...honorRows, ...extraHonorRows].flatMap((row) => {
    const title = cell(row, "Title", "Name", "Honor");
    if (!title) return [];
    return [
      {
        title,
        issuer: cell(row, "Issuer", "Issued By", "Authority") || null,
        date: cell(row, "Issued On", "IssuedOn", "Date", "On") || null,
        description: cell(row, "Description", "Notes") || null,
      },
    ];
  });

  const interests = interestRows.flatMap((row) => {
    const name = cell(row, "Name", "Interest", "Title");
    return name ? [name] : [];
  });

  return {
    fullName,
    email: "",
    phone: null,
    location: null,
    summary,
    links: [],
    skills,
    experiences,
    projects,
    education,
    certifications,
    awards,
    interests,
  };
}
