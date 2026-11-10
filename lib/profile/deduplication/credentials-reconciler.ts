import type {
  AwardItem,
  CertificationItem,
  EducationInput,
} from "@/lib/validations/profile.schema";
import {
  areDatePointsCompatible,
  areDateRangesCompatible,
  normalizeDateString,
  resolveGranularDate,
} from "@/lib/utils/date";
import {
  calculateEntitySimilarity,
  normalizeString,
} from "./token-similarity";

/**
 * Normalizes degree level to a canonical tier for career-agnostic comparison.
 */
export function normalizeDegreeLevel(degree: string | null | undefined): string | null {
  if (!degree) return null;
  const lower = degree.toLowerCase();
  if (/\b(?:bachelor|bachelors|b\.?s\.?|b\.?a\.?|b\.?s\.?e\.?|b\.?f\.?a\.?|b\.?b\.?a\.?|b\.?eng)\b/i.test(lower)) return "bachelor";
  if (/\b(?:master|masters|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?s\.?c\.?|m\.?f\.?a\.?|m\.?eng|m\.?p\.?s\.?)\b/i.test(lower)) return "master";
  if (/\b(?:doctor|doctorate|ph\.?d\.?|m\.?d\.?|j\.?d\.?|ed\.?d\.?)\b/i.test(lower)) return "doctorate";
  if (/\b(?:associate|associates|a\.?a\.?|a\.?s\.?|a\.?a\.?s\.?)\b/i.test(lower)) return "associate";
  return null;
}

/**
 * Checks whether two education entries describe the same degree program.
 */
export function isEducationMatch(
  a: Partial<EducationInput> & { institution: string },
  b: Partial<EducationInput> & { institution: string }
): boolean {
  if (!a.institution || !b.institution) return false;

  const instSim = calculateEntitySimilarity(a.institution, b.institution);
  if (!instSim.isMatch) return false;

  const subA = normalizeString(a.subSchool ?? "");
  const subB = normalizeString(b.subSchool ?? "");
  if (subA && subB && subA !== subB) return false;

  const levelA = normalizeDegreeLevel(a.degree);
  const levelB = normalizeDegreeLevel(b.degree);
  if (levelA && levelB && levelA !== levelB) {
    return false;
  }

  const degA = normalizeString(a.degree ?? "");
  const degB = normalizeString(b.degree ?? "");
  if (degA && degB && degA === degB) return true;

  const fieldA = normalizeString(a.fieldOfStudy ?? "");
  const fieldB = normalizeString(b.fieldOfStudy ?? "");
  if (fieldA && fieldB) {
    const fieldSim = calculateEntitySimilarity(a.fieldOfStudy, b.fieldOfStudy);
    if (!fieldSim.isMatch && fieldA !== fieldB) {
      return false;
    }
  }

  const rangeA = { start: a.startDate, end: a.graduationDate || a.endDate };
  const rangeB = { start: b.startDate, end: b.graduationDate || b.endDate };
  if (!areDateRangesCompatible(rangeA, rangeB)) {
    if (degA !== degB) return false;
  }

  return true;
}

export function reconcileEducationPair(
  target: EducationInput,
  incoming: EducationInput
): EducationInput {
  return {
    ...target,
    degree: target.degree || incoming.degree,
    subSchool: target.subSchool || incoming.subSchool,
    fieldOfStudy: target.fieldOfStudy || incoming.fieldOfStudy,
    startDate:
      resolveGranularDate(target.startDate, incoming.startDate) ||
      target.startDate ||
      incoming.startDate ||
      "Present",
    graduationDate: resolveGranularDate(target.graduationDate, incoming.graduationDate),
    status:
      incoming.status && incoming.status !== "GRADUATED"
        ? incoming.status
        : target.status ?? incoming.status ?? "GRADUATED",
    gpa: target.gpa || incoming.gpa,
    honors: [...(target.honors ?? []), ...(incoming.honors ?? [])].filter(
      (honor, index, list) =>
        list.findIndex((item) => item.toLowerCase() === honor.toLowerCase()) === index
    ),
    coursework: [...(target.coursework ?? []), ...(incoming.coursework ?? [])].filter(
      (course, index, list) =>
        list.findIndex((item) => item.toLowerCase() === course.toLowerCase()) === index
    ),
  };
}

export function deduplicateEducationCollection(
  education: EducationInput[]
): EducationInput[] {
  const consolidated: EducationInput[] = [];
  for (const ed of education) {
    if (!ed.institution || !ed.institution.trim()) continue;
    const matchIndex = consolidated.findIndex((e) => isEducationMatch(e, ed));
    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileEducationPair(consolidated[matchIndex]!, ed);
    } else {
      consolidated.push({
        ...ed,
        startDate: normalizeDateString(ed.startDate) || ed.startDate,
        graduationDate: normalizeDateString(ed.graduationDate) || ed.graduationDate,
      });
    }
  }
  return consolidated;
}

export function isCertificationMatch(
  a: CertificationItem,
  b: CertificationItem
): boolean {
  if (!a.name || !b.name) return false;

  const normA = normalizeString(a.name);
  const normB = normalizeString(b.name);
  if (normA && normB && normA === normB) return true;

  const nameSim = calculateEntitySimilarity(a.name, b.name);
  if (nameSim.isMatch && nameSim.overlap >= 0.70) {
    if (a.issuer && b.issuer) {
      const issuerSim = calculateEntitySimilarity(a.issuer, b.issuer);
      if (!issuerSim.isMatch && issuerSim.score < 0.40) return false;
    }
    if (a.date && b.date && !areDatePointsCompatible(a.date, b.date)) {
      return false;
    }
    return true;
  }

  return false;
}

export function reconcileCertificationPair(
  target: CertificationItem,
  incoming: CertificationItem
): CertificationItem {
  return {
    ...target,
    issuer: target.issuer || incoming.issuer,
    date: resolveGranularDate(target.date, incoming.date),
    url: target.url || incoming.url,
  };
}

export function deduplicateCertificationCollection(
  certifications: CertificationItem[]
): CertificationItem[] {
  const consolidated: CertificationItem[] = [];
  for (const cert of certifications) {
    if (!cert.name || !cert.name.trim()) continue;
    const matchIndex = consolidated.findIndex((c) => isCertificationMatch(c, cert));
    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileCertificationPair(consolidated[matchIndex]!, cert);
    } else {
      consolidated.push({
        ...cert,
        date: normalizeDateString(cert.date) || cert.date,
      });
    }
  }
  return consolidated;
}

export function isAwardMatch(
  a: AwardItem,
  b: AwardItem
): boolean {
  if (!a.title || !b.title) return false;

  const normA = normalizeString(a.title);
  const normB = normalizeString(b.title);
  if (normA && normB && normA === normB) return true;

  const titleSim = calculateEntitySimilarity(a.title, b.title);
  if (titleSim.isMatch && titleSim.overlap >= 0.70) {
    if (a.issuer && b.issuer) {
      const issuerSim = calculateEntitySimilarity(a.issuer, b.issuer);
      if (!issuerSim.isMatch && issuerSim.score < 0.40) return false;
    }
    if (a.date && b.date && !areDatePointsCompatible(a.date, b.date)) {
      return false;
    }
    return true;
  }

  return false;
}

export function reconcileAwardPair(
  target: AwardItem,
  incoming: AwardItem
): AwardItem {
  return {
    ...target,
    issuer: target.issuer || incoming.issuer,
    date: resolveGranularDate(target.date, incoming.date),
    description: target.description || incoming.description,
  };
}

export function deduplicateAwardCollection(
  awards: AwardItem[]
): AwardItem[] {
  const consolidated: AwardItem[] = [];
  for (const award of awards) {
    if (!award.title || !award.title.trim()) continue;
    const matchIndex = consolidated.findIndex((a) => isAwardMatch(a, award));
    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileAwardPair(consolidated[matchIndex]!, award);
    } else {
      consolidated.push({
        ...award,
        date: normalizeDateString(award.date) || award.date,
      });
    }
  }
  return consolidated;
}
