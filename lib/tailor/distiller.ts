import type { JobTargetContext } from "./schema.ssot";

export const COMMON_STOP_WORDS = new Set([
  "and", "the", "for", "with", "are", "you", "our", "all", "that", "this",
  "from", "your", "will", "have", "been", "has", "not", "but", "can", "they",
  "more", "into", "their", "here", "were", "what", "when", "where", "how",
  "who", "which", "why", "per", "also", "some", "such", "than", "then",
  "about", "would", "like", "just", "role", "team", "company", "work",
  "join", "help", "need", "looking", "seeking", "experienced", "candidate",
  "responsible", "skills", "ability", "strong", "knowledge", "years", "plus",
  "in", "at", "to", "on", "by", "an", "is", "as", "if", "or", "so", "we",
  "he", "it", "my", "me", "no", "up", "do", "am", "be", "us", "of",
]);

/**
 * Extracts normalized keyword tokens from job text/requirements for lexical comparison.
 */
export function extractCompetencyTokens(text: string): string[] {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9+#.]/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => (t.length >= 2 || t === "c" || t === "r") && !COMMON_STOP_WORDS.has(t));

  return Array.from(new Set(tokens));
}

/**
 * Detects implicit seniority expectations from role title or job description.
 */
export function detectSeniorityExpectation(roleTitle?: string | null, jobText?: string | null): string | null {
  const combined = `${roleTitle || ""} ${jobText?.slice(0, 500) || ""}`.toLowerCase();
  if (/\b(?:director|vp|vice\s+president|executive|chief|head\s+of)\b/.test(combined)) return "Executive / Director";
  if (/\b(?:staff|principal|distinguished)\b/.test(combined)) return "Staff / Principal";
  if (/\b(?:lead|manager|tech\s+lead)\b/.test(combined)) return "Lead / Manager";
  if (/\b(?:senior|sr\.?)\b/.test(combined)) return "Senior";
  if (/\b(?:intern|internship|co-?op|entry|associate|junior|jr\.?)\b/.test(combined)) return "Early Career / Entry";
  return "Mid-Level Professional";
}

/**
 * Distills raw job requirements and descriptions into a structured JobTargetContext.
 */
export function distillJobContext(input: {
  roleTitle?: string | null;
  companyName?: string | null;
  jobRequirements?: string[];
  jobText?: string | null;
}): JobTargetContext {
  const roleTitle = input.roleTitle?.trim() || "Target Role";
  const companyName = input.companyName?.trim() || null;
  const rawText = input.jobText?.trim() || null;

  const rawReqs = input.jobRequirements || [];
  const reqTokens = extractCompetencyTokens(
    [roleTitle, ...rawReqs, rawText?.slice(0, 1500) || ""].join(" ")
  );

  const coreCompetencies = reqTokens.slice(0, 16);
  const seniorityExpectation = detectSeniorityExpectation(roleTitle, rawText);

  return {
    roleTitle,
    companyName,
    coreCompetencies,
    seniorityExpectation,
    rawText,
  };
}
