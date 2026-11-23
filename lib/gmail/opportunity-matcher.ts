import type { JobOpportunity } from "@/lib/generated/prisma/client";
import type { gmail_v1 } from "googleapis";

import { prisma } from "@/lib/core/prisma";
import { isKnownJobDomain } from "@/lib/constants/job-sources";
import { isLocationCompatible } from "@/lib/utils/location";
import { rethrowIfInsufficientScope } from "@/lib/gmail/google";
import type { parseAccountRules } from "@/lib/validations/rules.schema";
import {
  genericRoleTitle,
  isGenericTitle,
} from "./application-parser";

/** Normalize role titles for fuzzy equality (strip Jr/Sr/II noise). */
export function normalizeOpportunityTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Determines if two opportunity titles are fuzzy duplicates. */
export function opportunityTitlesMatch(a: string, b: string): boolean {
  const na = normalizeOpportunityTitle(a);
  const nb = normalizeOpportunityTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Determines if two application URLs point to the same destination path. */
export function applyUrlsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = a.trim().replace(/\/+$/, "");
  const nb = b.trim().replace(/\/+$/, "");
  if (na === nb) return true;
  try {
    const urlA = new URL(na);
    const urlB = new URL(nb);
    if (
      urlA.hostname.replace(/^www\./, "") ===
        urlB.hostname.replace(/^www\./, "") &&
      urlA.pathname.replace(/\/+$/, "") === urlB.pathname.replace(/\/+$/, "")
    ) {
      return true;
    }
  } catch {}
  return false;
}

/** Returns true if opportunity was dismissed or user-archived to prevent resurrection. */
export function isSuppressedOpportunity(row: JobOpportunity): boolean {
  if (row.status === "DISMISSED") return true;
  if (row.isArchived && row.previousStatus != null) return true;
  return false;
}

/** Returns true if the status represents an active visible opportunity. */
export function isActiveOpportunityStatus(status: string): boolean {
  return (
    status === "DISCOVERED" ||
    status === "REVIEW_READY" ||
    status === "APPLIED" ||
    status === "LEAD"
  );
}

/**
 * Multi-tier opportunity dedupe before create:
 * 1) Same emailMessageId — applyUrl, else title + location
 * 2) Cross-email company + title + location (suppress dismissed/archived)
 * 3) none → caller inserts
 */
export async function findMatchingOpportunity(input: {
  accountId: string;
  emailMessageId: string;
  company: string;
  title: string;
  location: string | null | undefined;
  applyUrl: string | null | undefined;
  isAlreadyApplied: boolean;
  cachedSameEmailRows?: JobOpportunity[];
  cachedCompanyRows?: JobOpportunity[];
}): Promise<
  | { kind: "update"; row: JobOpportunity; upgradingPlaceholder: boolean }
  | { kind: "suppress"; row: JobOpportunity }
  | { kind: "none" }
> {
  const {
    accountId,
    emailMessageId,
    company,
    title,
    location,
    applyUrl,
    isAlreadyApplied,
    cachedSameEmailRows,
    cachedCompanyRows,
  } = input;

  // ── Tier 1: same-email origin ───────────────────────────────────────────
  const sameEmailRows =
    cachedSameEmailRows ??
    (await prisma.jobOpportunity.findMany({
      where: { accountId, emailMessageId },
    }));

  const isPlaceholderOrAggregator = (comp: string, domain?: string | null): boolean => {
    const c = comp.trim().toLowerCase();
    if (
      c === "unknown company" ||
      c.includes("jobleads") ||
      isKnownJobDomain(c) ||
      isGenericTitle(comp, title)
    ) {
      return true;
    }
    if (domain && (domain.toLowerCase().includes("jobleads") || isKnownJobDomain(domain))) {
      return true;
    }
    return false;
  };

  const tier1 =
    sameEmailRows.find(
      (row) =>
        applyUrlsMatch(applyUrl, row.applyUrl) &&
        (opportunityTitlesMatch(title, row.title) ||
          isGenericTitle(row.title, row.company) ||
          row.title.toLowerCase() === "role")
    ) ??
    sameEmailRows.find(
      (row) => applyUrlsMatch(applyUrl, row.applyUrl)
    ) ??
    sameEmailRows.find(
      (row) =>
        (row.company.trim().toLowerCase() === company.trim().toLowerCase() ||
          isPlaceholderOrAggregator(row.company, row.companyDomain)) &&
        opportunityTitlesMatch(title, row.title) &&
        isLocationCompatible(location, row.location)
    ) ??
    sameEmailRows.find(
      (row) =>
        isPlaceholderOrAggregator(row.company, row.companyDomain) &&
        opportunityTitlesMatch(title, row.title)
    );

  if (tier1) {
    return { kind: "update", row: tier1, upgradingPlaceholder: false };
  }

  // ── Tier 2: cross-email company + role + location ───────────────────────
  if (!company || company.trim().toLowerCase() === "unknown company") {
    return { kind: "none" };
  }

  const companyRows =
    cachedCompanyRows ??
    (await prisma.jobOpportunity.findMany({
      where: {
        accountId,
        company: { equals: company, mode: "insensitive" },
      },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }));

  let upgradingPlaceholder = false;
  let tier2 =
    companyRows.find(
      (row) =>
        opportunityTitlesMatch(title, row.title) &&
        isLocationCompatible(location, row.location)
    ) ?? null;

  // Upgrade generic placeholders when an applied confirmation carries a real title.
  if (
    !tier2 &&
    isAlreadyApplied &&
    !isGenericTitle(title, company)
  ) {
    const placeholder = companyRows.find(
      (row) =>
        isLocationCompatible(location, row.location) &&
        (isGenericTitle(row.title, company) ||
          row.title.toLowerCase() === "applied position" ||
          row.title.toLowerCase() === "applicant" ||
          row.title.toLowerCase() === genericRoleTitle(company).toLowerCase())
    );
    if (placeholder) {
      tier2 = placeholder;
      upgradingPlaceholder = true;
    }
  }

  if (tier2) {
    if (isSuppressedOpportunity(tier2)) {
      return { kind: "suppress", row: tier2 };
    }
    if (isActiveOpportunityStatus(tier2.status) || !tier2.isArchived) {
      return { kind: "update", row: tier2, upgradingPlaceholder };
    }
    return { kind: "suppress", row: tier2 };
  }

  return { kind: "none" };
}

/** Maps raw classification status string into standard application lifecycle status. */
export function mapClassificationStatus(
  status: string
): "LEAD" | "APPLIED" | "OA" | "INTERVIEW" | "OFFER" | "REJECTION" | "ARCHIVED" {
  switch (status) {
    case "OA":
    case "INTERVIEW":
    case "OFFER":
    case "REJECTION":
    case "APPLIED":
    case "ARCHIVED":
      return status;
    case "RECEIVED":
    case "LEAD":
    case "OTHER":
    default:
      return "APPLIED";
  }
}

/** Executes configured rejection rule (trash message or apply rejection label). */
export async function applyRejectionAction(
  gmail: gmail_v1.Gmail,
  messageId: string,
  rules: ReturnType<typeof parseAccountRules>
): Promise<{ isTrashed: boolean; isArchived: boolean }> {
  try {
    if (rules.rejectionMode === "AUTO_TRASH") {
      await gmail.users.messages.trash({ userId: "me", id: messageId });
      return { isTrashed: true, isArchived: false };
    }

    const labelIds: string[] = [];
    if (rules.rejectionLabelId) {
      labelIds.push(rules.rejectionLabelId);
    }

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: labelIds.length > 0 ? labelIds : undefined,
        removeLabelIds: ["INBOX"],
      },
    });

    return { isTrashed: false, isArchived: true };
  } catch (error) {
    rethrowIfInsufficientScope(error);
  }
}

/** Parses deadline ISO string into a valid Date or null. */
export function parseDeadline(iso: string | null): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
