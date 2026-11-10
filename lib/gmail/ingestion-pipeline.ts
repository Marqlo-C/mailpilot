import type { gmail_v1 } from "googleapis";
import type { JobOpportunity } from "@prisma/client";
import { rethrowIfInsufficientScope } from "@/lib/gmail/google";
import { type classifyJobEmail } from "@/lib/ai";
import { ensurePersistentProfileForAccount } from "@/lib/profile/persistent-profile";
import { resolveApplicationType } from "@/lib/opportunities/application-method";
import {
  normalizeSalaryDisplay,
  parseSalaryMax,
} from "@/lib/ai/classifier";
import {
  normalizePostedAt,
  relativeTimeToIso,
  sanitizeCompanyName,
  extractCleanSnippet,
  sanitizeJobDescription,
} from "@/lib/opportunities/context";
import {
  getCompanyLogoUrl,
  inferDomainFromUrl,
} from "@/lib/utils/company-logo";
import { isKnownJobDomain } from "@/lib/constants/job-sources";
import {
  genericRoleTitle,
  isGenericTitle,
  parseApplicationEmail,
} from "./application-parser";
import { prisma } from "@/lib/core/prisma";
import { isLocationCompatible } from "@/lib/utils/location";
import {
  parseAccountRules,
  titleMatchesExcluded,
} from "@/lib/validations/rules.schema";
import type { SenderInfo } from "./subscription-pipeline";

export type { SenderInfo };

export type ClassifiableAccount = {
  id: string;
  email: string;
  persistentProfileId: string | null;
  settings: {
    llmProvider: string;
    localOllamaUrl: string | null;
    ollamaModel: string | null;
    rules: unknown;
  } | null;
};

/** Normalize role titles for fuzzy equality (strip Jr/Sr/II noise). */
export function normalizeOpportunityTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function opportunityTitlesMatch(a: string, b: string): boolean {
  const na = normalizeOpportunityTitle(a);
  const nb = normalizeOpportunityTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

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

export function isSuppressedOpportunity(row: JobOpportunity): boolean {
  if (row.status === "DISMISSED") return true;
  // User-archived (history) — do not resurrect via ingest.
  if (row.isArchived && row.previousStatus != null) return true;
  return false;
}

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
 * 3) null → caller inserts
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

function parseDeadline(iso: string | null): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Persists LLM classification: APPLICATION_STATUS → JobApplication;
 * DIRECT_RECRUITER / JOB_BOARD_DIGEST → EmailMessage + JobOpportunity rows.
 */
export async function persistClassifiedEmail(input: {
  gmail: gmail_v1.Gmail;
  account: ClassifiableAccount;
  messageId: string;
  threadId: string;
  subject: string;
  /** Cleaned body used for parsing / snippet preview / already-classified LLM text. */
  body: string;
  /** Full extracted Gmail body preserved for drafting. */
  rawBody?: string | null;
  sender: SenderInfo | null;
  emailDate: Date;
  classification: NonNullable<
    Awaited<ReturnType<typeof classifyJobEmail>>
  >;
  rules: ReturnType<typeof parseAccountRules>;
  classificationMethod?: "AI" | "HEURISTIC" | "HYBRID";
}): Promise<{
  opportunitiesUpserted: number;
  applicationTouched: boolean;
  createdCount: number;
  updatedCount: number;
  lastAction?: string;
  emailMessageId?: string;
}> {
  const {
    gmail,
    account,
    messageId,
    threadId,
    subject,
    body,
    sender,
    emailDate,
    classification,
    rules,
    classificationMethod,
  } = input;

  let createdCount = 0;
  let updatedCount = 0;
  let lastAction = "";

  const snippetPreview = extractCleanSnippet(body, 500, 1500);

  const emailMessage = await prisma.emailMessage.upsert({
    where: {
      accountId_messageId: {
        accountId: account.id,
        messageId,
      },
    },
    create: {
      accountId: account.id,
      messageId,
      threadId,
      subject,
      fromEmail: sender?.email ?? null,
      fromName: sender?.name ?? null,
      emailCategory: classification.email_category,
      emailDate,
      snippet: snippetPreview,
      rawBody: null,
    },
    update: {
      threadId,
      subject,
      fromEmail: sender?.email ?? null,
      fromName: sender?.name ?? null,
      emailCategory: classification.email_category,
      emailDate,
      snippet: snippetPreview,
      rawBody: null,
    },
  });

  if (classification.email_category === "APPLICATION_STATUS") {
    let mappedStatus = mapClassificationStatus(classification.status);

    const parsedApp = parseApplicationEmail(subject, body);
    if (parsedApp) {
      classification.company_name = parsedApp.company;
      classification.role_title = parsedApp.title;
      mappedStatus = "APPLIED";
      if (classification.jobs.length > 0) {
        const job0 = classification.jobs[0];
        job0.company = parsedApp.company;
        if (!isGenericTitle(parsedApp.title, parsedApp.company)) {
          job0.title = parsedApp.title;
        }
        if (parsedApp.location) {
          job0.location = parsedApp.location;
        }
        job0.isAlreadyApplied = true;
      }
    }

    if (classification.jobs.length === 0) {
      if (
        mappedStatus === "APPLIED" &&
        (classification.company_name?.trim() ||
          classification.role_title?.trim())
      ) {
        classification.jobs.push({
          company: classification.company_name?.trim() || "Unknown Company",
          companyDomain: null,
          title:
            classification.role_title?.trim() ||
            genericRoleTitle(
              classification.company_name?.trim() || "Unknown Company"
            ),
          location: parsedApp?.location ?? null,
          salary: null,
          salaryMax: null,
          postedAt: null,
          description:
            classification.action_summary ??
            "Application confirmation detected via inbox",
          applyUrl: classification.action_url,
          applicationType: "EXTERNAL_LINK",
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: true,
          matchScore: 80,
          matchReason: "Application confirmed via email receipt.",
        });
      }
    }

    const preferOpportunityPipeline =
      mappedStatus === "APPLIED" && classification.jobs.length > 0;

    if (preferOpportunityPipeline) {
      const companyName = classification.company_name?.trim();
      await prisma.jobApplication.deleteMany({
        where: {
          accountId: account.id,
          OR: [
            { messageId },
            ...(companyName
              ? [
                  {
                    companyName: {
                      equals: companyName,
                      mode: "insensitive" as const,
                    },
                    status: "APPLIED" as const,
                  },
                ]
              : []),
          ],
        },
      });
    } else {
      const lifecycleStatuses = new Set([
        "OA",
        "INTERVIEW",
        "OFFER",
        "REJECTION",
        "APPLIED",
      ]);

      let isTrashed = false;
      let isArchived = false;

      if (mappedStatus === "REJECTION") {
        const action = await applyRejectionAction(gmail, messageId, rules);
        isTrashed = action.isTrashed;
        isArchived = action.isArchived;
      }

      const actionRequired =
        mappedStatus === "INTERVIEW" || mappedStatus === "OA"
          ? true
          : classification.action_required;

      const deadlineAt = parseDeadline(classification.deadline_iso);
      const companyName = classification.company_name;
      const durable = await ensurePersistentProfileForAccount(account);

      if (lifecycleStatuses.has(mappedStatus)) {
        const existing =
          (await prisma.jobApplication.findFirst({
            where: {
              OR: [
                { accountId: account.id, threadId },
                { persistentProfileId: durable.id, threadId },
              ],
            },
          })) ??
          (companyName
            ? await prisma.jobApplication.findFirst({
                where: {
                  OR: [
                    { accountId: account.id },
                    { persistentProfileId: durable.id },
                  ],
                  companyName: {
                    contains: companyName,
                    mode: "insensitive",
                  },
                  status: {
                    in: ["LEAD", "APPLIED", "OA", "INTERVIEW", "OFFER"],
                  },
                },
                orderBy: { updatedAt: "desc" },
              })
            : null);

        if (existing) {
          await prisma.jobApplication.update({
            where: { id: existing.id },
            data: {
              messageId,
              threadId,
              accountId: account.id,
              persistentProfileId: durable.id,
              status: mappedStatus,
              companyName: companyName ?? existing.companyName,
              roleTitle: classification.role_title ?? existing.roleTitle,
              actionRequired,
              actionSummary: classification.action_summary,
              actionUrl: classification.action_url,
              deadlineAt,
              emailDate,
              isTrashed,
              isArchived,
            },
          });
          updatedCount += 1;
          lastAction = `JobApplication: Updated status to ${mappedStatus} (${existing.id})`;
        } else {
          await prisma.jobApplication.upsert({
            where: {
              accountId_messageId: {
                accountId: account.id,
                messageId,
              },
            },
            create: {
              accountId: account.id,
              persistentProfileId: durable.id,
              messageId,
              threadId,
              companyName,
              roleTitle: classification.role_title,
              status: mappedStatus,
              dispatchType: "EMAIL",
              applicationMethod: "DIRECT_EMAIL",
              opportunityStatus: "DETECTED",
              dispatchStatus: "PENDING_REVIEW",
              actionRequired,
              actionSummary: classification.action_summary,
              actionUrl: classification.action_url,
              deadlineAt,
              emailDate,
              isTrashed,
              isArchived,
            },
            update: {
              persistentProfileId: durable.id,
              companyName,
              roleTitle: classification.role_title,
              status: mappedStatus,
              actionRequired,
              actionSummary: classification.action_summary,
              actionUrl: classification.action_url,
              deadlineAt,
              emailDate,
              isTrashed,
              isArchived,
            },
          });
          createdCount += 1;
          lastAction = `JobApplication: Recorded application status (${mappedStatus})`;
        }
      } else {
        await prisma.jobApplication.upsert({
          where: {
            accountId_messageId: {
              accountId: account.id,
              messageId,
            },
          },
          create: {
            accountId: account.id,
            persistentProfileId: durable.id,
            messageId,
            threadId,
            companyName,
            roleTitle: classification.role_title,
            status: mappedStatus,
            dispatchType: "EMAIL",
            applicationMethod: "DIRECT_EMAIL",
            opportunityStatus: "DETECTED",
            dispatchStatus: "PENDING_REVIEW",
            actionRequired,
            actionSummary: classification.action_summary,
            actionUrl: classification.action_url,
            deadlineAt,
            emailDate,
            isTrashed,
            isArchived,
          },
          update: {
            persistentProfileId: durable.id,
            companyName,
            roleTitle: classification.role_title,
            status: mappedStatus,
            actionRequired,
            actionSummary: classification.action_summary,
            actionUrl: classification.action_url,
            deadlineAt,
            emailDate,
            isTrashed,
            isArchived,
          },
        });
        createdCount += 1;
        lastAction = `JobApplication: Recorded application status (${mappedStatus})`;
      }

      if (classification.jobs.length === 0) {
        return {
          opportunitiesUpserted: 0,
          applicationTouched: true,
          createdCount,
          updatedCount,
          lastAction:
            lastAction ||
            `JobApplication: Recorded application status (${mappedStatus})`,
        };
      }
    }
  }

  const excludedTitles = rules.excludedTitles ?? [];
  let opportunitiesUpserted = 0;

  const uniqueCompanies = Array.from(
    new Set(
      classification.jobs
        .map((j) => sanitizeCompanyName(j.company))
        .filter(
          (c): c is string =>
            Boolean(c && c.toLowerCase() !== "unknown company")
        )
    )
  );

  const [sameEmailRows, preloadedCompanyRows] = await Promise.all([
    prisma.jobOpportunity.findMany({
      where: { accountId: account.id, emailMessageId: emailMessage.id },
    }),
    uniqueCompanies.length > 0
      ? prisma.jobOpportunity.findMany({
          where: {
            accountId: account.id,
            company: { in: uniqueCompanies, mode: "insensitive" },
          },
          orderBy: { receivedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const companyRowsByCompany = new Map<string, JobOpportunity[]>();
  for (const row of preloadedCompanyRows) {
    const key = row.company.trim().toLowerCase();
    const existing = companyRowsByCompany.get(key);
    if (existing) {
      existing.push(row);
    } else {
      companyRowsByCompany.set(key, [row]);
    }
  }

  for (const job of classification.jobs) {
    const cleanCompany = sanitizeCompanyName(job.company);
    const cleanTitle = job.title
      .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00AD]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanCompany || !cleanTitle) continue;

    const isDirectEmail =
      job.applicationType === "DIRECT_EMAIL" ||
      classification.email_category === "DIRECT_RECRUITER" ||
      Boolean(
        job.recipientEmail &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.recipientEmail)
      );

    const resolvedRecipientEmail =
      job.recipientEmail ??
      (classification.email_category === "DIRECT_RECRUITER" && sender?.email
        ? sender.email
        : null);

    const resolvedRecipientName = job.recipientName ?? sender?.name ?? null;

    const applicationType = isDirectEmail
      ? "DIRECT_EMAIL"
      : (job.applicationType ??
        resolveApplicationType({
          applyUrl: job.applyUrl,
          recipientEmail: resolvedRecipientEmail,
        }));

    const recipientEmail =
      applicationType === "DIRECT_EMAIL" ? resolvedRecipientEmail : null;

    const validApplyUrl =
      job.applyUrl && /^https?:\/\//i.test(job.applyUrl.trim())
        ? job.applyUrl.trim()
        : null;

    const isAggregatorRef = (val?: string | null): boolean => {
      if (!val) return false;
      const lower = val.toLowerCase();
      return lower.includes("jobleads") || isKnownJobDomain(lower);
    };

    let companyDomain = job.companyDomain;
    if (isAggregatorRef(companyDomain)) {
      companyDomain = null;
    }
    if (!companyDomain) {
      const inferred = inferDomainFromUrl(validApplyUrl);
      if (inferred && !isAggregatorRef(inferred)) {
        companyDomain = inferred;
      }
    }
    const logoUrl =
      job.logoUrl && /^https?:\/\//i.test(job.logoUrl) && !isAggregatorRef(job.logoUrl)
        ? job.logoUrl
        : getCompanyLogoUrl(cleanCompany, companyDomain, validApplyUrl);
    let matchScore =
      typeof job.matchScore === "number" ? job.matchScore : 0;
    if (matchScore > 0 && matchScore <= 1) {
      matchScore = Math.round(matchScore * 100);
    }
    let matchReason = job.matchReason ?? null;
    const excluded = titleMatchesExcluded(cleanTitle, excludedTitles);
    if (excluded) {
      matchScore = Math.min(matchScore, 20);
      if (!matchReason?.trim()) {
        matchReason = "Title matches an excluded role pattern.";
      }
    }
    const isAlreadyApplied = Boolean(job.isAlreadyApplied);

    const compKey = cleanCompany.toLowerCase();

    const match = await findMatchingOpportunity({
      accountId: account.id,
      emailMessageId: emailMessage.id,
      company: cleanCompany,
      title: cleanTitle,
      location: job.location,
      applyUrl: validApplyUrl,
      isAlreadyApplied,
      cachedSameEmailRows: sameEmailRows,
      cachedCompanyRows: companyRowsByCompany.get(compKey) ?? [],
    });

    if (match.kind === "suppress") {
      continue;
    }

    if (match.kind === "update") {
      const existing = match.row;
      const upgradingPlaceholder = match.upgradingPlaceholder;

      let resolvedStatus = existing.status;
      if (
        isAlreadyApplied &&
        existing.status !== "APPLIED" &&
        existing.status !== "DISMISSED"
      ) {
        resolvedStatus = "APPLIED";
      }

      const preserveLifecycle =
        existing.status === "APPLIED" ||
        existing.status === "DISMISSED" ||
        existing.status === "REVIEW_READY" ||
        resolvedStatus === "APPLIED";

      const appliedAt =
        resolvedStatus === "APPLIED"
          ? existing.appliedAt ?? emailDate ?? new Date()
          : existing.appliedAt;

      const safeExistingUrl =
        existing.applyUrl && /^https?:\/\//i.test(existing.applyUrl.trim())
          ? existing.applyUrl.trim()
          : null;

      const resolvedDescription =
        job.description ??
        (existing.description
          ? sanitizeJobDescription(existing.description, 4000, {
              roleTitle: cleanTitle,
              company: cleanCompany,
              location: job.location ?? existing.location,
              salary: job.salary ?? existing.salary,
            })
          : null);

      const existingHasAggregatorDomain = isAggregatorRef(existing.companyDomain);
      const existingHasAggregatorLogo = isAggregatorRef(existing.logoUrl);

      const resolvedCompanyDomain =
        existing.company.toLowerCase() === cleanCompany.toLowerCase() &&
        existing.companyDomain &&
        !existingHasAggregatorDomain
          ? existing.companyDomain
          : companyDomain && !isAggregatorRef(companyDomain)
            ? companyDomain
            : null;

      const resolvedLogoUrl =
        job.logoUrl && /^https?:\/\//i.test(job.logoUrl) && !isAggregatorRef(job.logoUrl)
          ? job.logoUrl
          : existing.company.toLowerCase() === cleanCompany.toLowerCase() &&
            existing.logoUrl &&
            !existingHasAggregatorLogo &&
            !existing.logoUrl.includes("ui-avatars") &&
            !existing.logoUrl.includes("unavatar.io") &&
            !existing.logoUrl.includes("google.com/s2/favicons")
            ? existing.logoUrl
            : logoUrl;

      const resolvedSalary =
        normalizeSalaryDisplay(job.salary) ?? normalizeSalaryDisplay(existing.salary);
      const resolvedSalaryMax =
        typeof job.salaryMax === "number"
          ? job.salaryMax
          : resolvedSalary
            ? parseSalaryMax(resolvedSalary)
            : existing.salaryMax;

      const resolvedPostedAt =
        relativeTimeToIso(job.postedAt, emailDate) ??
        relativeTimeToIso(existing.postedAt, existing.receivedAt) ??
        normalizePostedAt(job.postedAt, null, emailDate) ??
        normalizePostedAt(existing.postedAt, null, existing.receivedAt);

      const jobClassificationMethod =
        job.classificationMethod ?? classificationMethod ?? "AI";

      const updated = await prisma.jobOpportunity.update({
        where: { id: existing.id },
        data: {
          company: cleanCompany,
          title: cleanTitle,
          location: job.location ?? existing.location,
          salary: resolvedSalary,
          salaryMax: resolvedSalaryMax,
          postedAt: resolvedPostedAt,
          receivedAt:
            emailDate > existing.receivedAt ? emailDate : existing.receivedAt,
          description: resolvedDescription,
          applyUrl: validApplyUrl ?? safeExistingUrl,
          applicationType,
          recipientEmail: recipientEmail ?? existing.recipientEmail,
          recipientName: resolvedRecipientName ?? existing.recipientName,
          companyDomain: resolvedCompanyDomain,
          logoUrl: resolvedLogoUrl,
          matchScore,
          matchReason: matchReason ?? existing.matchReason,
          status: resolvedStatus,
          appliedAt,
          emailMessageId: emailMessage.id,
          isArchived: preserveLifecycle
            ? resolvedStatus === "APPLIED"
              ? false
              : existing.isArchived
            : false,
          ...(resolvedStatus === "APPLIED"
            ? { previousStatus: null, dismissedAt: null }
            : {}),
          ...(jobClassificationMethod ? { classificationMethod: jobClassificationMethod } : {}),
        },
      });

      const existingIdx = sameEmailRows.findIndex((r) => r.id === updated.id);
      if (existingIdx >= 0) {
        sameEmailRows[existingIdx] = updated;
      } else {
        sameEmailRows.push(updated);
      }

      const rows = companyRowsByCompany.get(compKey);
      if (rows) {
        const cIdx = rows.findIndex((r) => r.id === updated.id);
        if (cIdx >= 0) {
          rows[cIdx] = updated;
        } else {
          rows.push(updated);
        }
      } else {
        companyRowsByCompany.set(compKey, [updated]);
      }

      opportunitiesUpserted += 1;
      updatedCount += 1;
      lastAction = `Tier 2 Dedupe: Updated existing record (${existing.id.slice(-8)})`;
      continue;
    }

    // ── Tier 3: insert ────────────────────────────────────────────────────
    const initialStatus = isAlreadyApplied ? "APPLIED" : "DISCOVERED";
    const initialSalary = normalizeSalaryDisplay(job.salary);
    const initialSalaryMax =
      typeof job.salaryMax === "number"
        ? job.salaryMax
        : initialSalary
          ? parseSalaryMax(initialSalary)
          : null;
    const initialPostedAt =
      relativeTimeToIso(job.postedAt, emailDate) ??
      normalizePostedAt(job.postedAt, null, emailDate);
    const jobClassificationMethod =
      job.classificationMethod ?? classificationMethod ?? "AI";

    const created = await prisma.jobOpportunity.create({
      data: {
        accountId: account.id,
        emailMessageId: emailMessage.id,
        company: cleanCompany,
        title: cleanTitle,
        location: job.location ?? null,
        salary: initialSalary,
        salaryMax: initialSalaryMax,
        postedAt: initialPostedAt,
        receivedAt: emailDate,
        description: job.description ?? null,
        applyUrl: validApplyUrl,
        applicationType,
        recipientEmail,
        recipientName: resolvedRecipientName,
        companyDomain,
        logoUrl,
        matchScore,
        matchReason,
        status: initialStatus,
        appliedAt: isAlreadyApplied ? emailDate ?? new Date() : null,
        isArchived: false,
        classificationMethod: jobClassificationMethod,
      },
    });

    sameEmailRows.push(created);
    const rows = companyRowsByCompany.get(compKey);
    if (rows) {
      rows.push(created);
    } else {
      companyRowsByCompany.set(compKey, [created]);
    }

    opportunitiesUpserted += 1;
    createdCount += 1;
    lastAction = `Tier 3 Dedupe: Inserted new opportunity record`;
  }

  const finalAction =
    opportunitiesUpserted > 1
      ? `Digest Ingestion: ${opportunitiesUpserted} opportunities processed (${createdCount} Added, ${updatedCount} Deduped)`
      : lastAction ||
        (opportunitiesUpserted > 0
          ? `Saved ${opportunitiesUpserted} opportunity record(s)`
          : "Processed");

  return {
    opportunitiesUpserted,
    applicationTouched: classification.email_category === "APPLICATION_STATUS",
    createdCount,
    updatedCount,
    lastAction: finalAction,
    emailMessageId: emailMessage.id,
  };
}
