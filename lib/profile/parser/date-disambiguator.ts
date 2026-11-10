/**
 * Date Normalization & Education Enrollment Status Inference Engine.
 */

import { normalizeDateString } from "@/lib/utils/date";
import type { EducationStatus } from "@/lib/validations/profile.schema";

export const OPEN_ENDED_END = /^(?:present|current|ongoing|now|to date)$/i;
export const ENROLLMENT_MARKER =
  /^(?:expected|anticipated)(?:\s+graduation)?\s+|^(?:class of)\s+/i;
export const ENROLLMENT_HINT = /\b(?:expected|anticipated|candidate|in progress)\b/i;
export const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;
export const MONTH_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
export const RANGE_SPLIT = /\s*[-–—]\s*/;
export const TRAILING_DASH = /^(.+?)\s*[-–—]\s*$/;

export const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function cleanDateToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

export function monthIndex(token: string): number | null {
  const key = token.toLowerCase().slice(0, 3);
  return key in MONTH_INDEX ? MONTH_INDEX[key]! : null;
}

export function dateParts(value: string): { year: number; month: number | null } | null {
  const yearMatch = value.match(YEAR_PATTERN);
  if (!yearMatch) return null;
  const monthMatch = value.match(MONTH_PATTERN);
  return {
    year: Number(yearMatch[0]),
    month: monthMatch?.[1] ? monthIndex(monthMatch[1]) : null,
  };
}

export function looksLikeDate(value: string): boolean {
  return YEAR_PATTERN.test(value) || MONTH_PATTERN.test(value);
}

export function isFutureDate(value: string, now: Date): boolean {
  const parts = dateParts(value);
  if (!parts) return false;
  if (parts.year > now.getFullYear()) return true;
  if (parts.year < now.getFullYear()) return false;
  if (parts.month == null) return false;
  return parts.month > now.getMonth();
}

export function isPastDate(value: string, now: Date): boolean {
  const parts = dateParts(value);
  if (!parts) return false;
  if (parts.year < now.getFullYear()) return true;
  if (parts.year > now.getFullYear()) return false;
  if (parts.month == null) return false;
  return parts.month < now.getMonth();
}

export function isOpenEndedToken(value: string): boolean {
  return OPEN_ENDED_END.test(value.trim());
}

export function trailingDashDate(value: string): string | null {
  const match = value.match(TRAILING_DASH);
  const left = match?.[1]?.trim() ?? "";
  if (!left || !looksLikeDate(left)) return null;
  return left;
}

export function splitClosedRange(value: string): { start: string; end: string } | null {
  if (trailingDashDate(value)) return null;
  const parts = value
    .split(RANGE_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const start = parts[0]!;
  const end = parts[1]!;
  if (!looksLikeDate(start)) return null;
  if (!looksLikeDate(end) && !isOpenEndedToken(end)) return null;
  return { start, end };
}

export function stripEnrollmentMarker(value: string): { text: string; marked: boolean } {
  const marked = ENROLLMENT_MARKER.test(value.trim());
  return {
    text: value.replace(ENROLLMENT_MARKER, "").trim(),
    marked,
  };
}

export function singleDateStatus(value: string, now: Date): EducationStatus {
  if (isFutureDate(value, now)) return "IN_PROGRESS";
  if (isPastDate(value, now)) return "GRADUATED";
  const parts = dateParts(value);
  if (!parts) return "UNSURE";
  if (parts.year === now.getFullYear() && parts.month == null) return "UNSURE";
  if (parts.year === now.getFullYear()) return "IN_PROGRESS";
  return "UNSURE";
}

/**
 * Turns a raw education date pair into a start date, clean graduation token,
 * and enrollment status without leaving open dashes or markers inside date fields.
 */
export function normalizeEducationDatesAndStatus<
  T extends {
    degree?: string | null;
    fieldOfStudy?: string | null;
    notes?: string | null;
    startDate?: string | null;
    graduationDate?: string | null;
    endDate?: string | null;
    status?: string | null;
  },
>(
  item: T,
  now: Date = new Date()
): T & {
  startDate: string | null;
  graduationDate: string | null;
  endDate: string | null;
  status: EducationStatus;
} {
  let start = cleanDateToken(item.startDate);
  let graduation =
    cleanDateToken(item.graduationDate) ?? cleanDateToken(item.endDate);
  let expected = false;
  let openEnded = false;

  if (start) {
    const stripped = stripEnrollmentMarker(start);
    expected = expected || stripped.marked;
    start = cleanDateToken(stripped.text);
  }
  if (graduation) {
    const stripped = stripEnrollmentMarker(graduation);
    expected = expected || stripped.marked;
    graduation = cleanDateToken(stripped.text);
  }
  if (expected && start && !graduation) {
    graduation = start;
    start = null;
  }

  const openGraduation = graduation ? trailingDashDate(graduation) : null;
  if (openGraduation) {
    if (!start) start = openGraduation;
    graduation = null;
    openEnded = true;
  }
  const openStart = start ? trailingDashDate(start) : null;
  if (openStart) {
    start = openStart;
    openEnded = true;
  }

  const ranged =
    !start && graduation
      ? splitClosedRange(graduation)
      : !graduation && start
        ? splitClosedRange(start)
        : null;
  if (ranged) {
    start = ranged.start;
    graduation = ranged.end;
  }
  if (graduation && isOpenEndedToken(graduation)) {
    graduation = null;
    openEnded = true;
  }

  const notes = [item.degree, item.fieldOfStudy, item.notes]
    .map((value) => value?.trim() || "")
    .filter(Boolean)
    .join(" ");
  const hinted = ENROLLMENT_HINT.test(notes);

  let status: EducationStatus | null =
    expected || openEnded || hinted ? "IN_PROGRESS" : null;

  if (!status && start && graduation) {
    status = isFutureDate(graduation, now) ? "IN_PROGRESS" : "GRADUATED";
  }
  if (!status && !start && graduation) {
    status = singleDateStatus(graduation, now);
  }
  if (!status && start && !graduation) {
    if (openEnded) {
      status = "IN_PROGRESS";
    } else {
      graduation = start;
      start = null;
      status = singleDateStatus(graduation, now);
    }
  }
  if (!status) status = "GRADUATED";

  const normStart = normalizeDateString(start);
  const normGrad = normalizeDateString(graduation);

  return {
    ...item,
    startDate: normStart ?? start,
    graduationDate: normGrad ?? graduation,
    endDate: normGrad ?? graduation,
    status,
  };
}
