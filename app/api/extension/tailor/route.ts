import { prisma } from "@/lib/core/prisma";
import { getExtensionAccountId } from "@/lib/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/extension/cors";
import { prepareOpportunityResume } from "@/lib/opportunities/dispatch/resume";
import { getCompanyLogoUrl, inferApexDomainFromCompanyName } from "@/lib/utils/company-logo";
import { parseStructuredJobSections } from "@/lib/opportunities/context/section-classifier";
import { normalizeSalaryDisplay, parseSalaryMax } from "@/lib/ai/classifier";
import { tailorRequestSchema } from "@/lib/validations/extension";

export async function OPTIONS(request: Request) {
  return handleOptionsCors(request);
}

export async function POST(request: Request) {
  const accountId = await getExtensionAccountId(request);
  if (!accountId) {
    return jsonWithCors(
      { ok: false, error: "Unauthorized: Active session required" },
      { status: 401, request }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400, request }
    );
  }

  const parsed = tailorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400, request }
    );
  }

  const {
    company,
    title,
    description,
    url,
    location,
    salary,
    logoUrl: incomingLogoUrl,
    pageBudget,
    includeSummary,
    opportunityId: incomingOppId,
  } = parsed.data;

  try {
    let opportunityId = incomingOppId;

    if (opportunityId) {
      const existing = await prisma.jobOpportunity.findFirst({
        where: { id: opportunityId, accountId },
        select: { id: true, company: true, title: true },
      });
      // If the incoming company name does not match the existing opportunity,
      // treat it as a distinct opportunity rather than overwriting the previous one.
      if (!existing || existing.company.trim().toLowerCase() !== company.trim().toLowerCase()) {
        opportunityId = undefined;
      }
    }

    const apexDomain = inferApexDomainFromCompanyName(company.trim());
    const fallbackLogoUrl = getCompanyLogoUrl(company.trim(), apexDomain, url?.trim() || null);
    const logoUrl = (incomingLogoUrl && incomingLogoUrl.trim()) || fallbackLogoUrl;

    const normalizedSalary = salary?.trim() ? normalizeSalaryDisplay(salary.trim()) : null;
    const salaryMax = normalizedSalary ? parseSalaryMax(normalizedSalary) : null;

    // Normalize description via unified structured markdown & section parser
    const structured = parseStructuredJobSections(description);
    const finalDescription = (structured.fullReconstructedMarkdown || description).trim();

    if (!opportunityId) {
      const existingLead = await prisma.jobOpportunity.findFirst({
        where: {
          accountId,
          company: { equals: company.trim(), mode: "insensitive" },
          title: { equals: title.trim(), mode: "insensitive" },
          status: { in: ["DISCOVERED", "LEAD"] },
        },
        select: { id: true },
      });

      if (existingLead) {
        opportunityId = existingLead.id;
        await prisma.jobOpportunity.update({
          where: { id: opportunityId },
          data: {
            description: finalDescription,
            applyUrl: url?.trim() || undefined,
            location: location?.trim() || undefined,
            salary: normalizedSalary ?? undefined,
            salaryMax: salaryMax ?? undefined,
            status: "DISCOVERED",
            matchScore: 100,
            matchReason: "Tailored via Mail Pilot + Companion",
            companyDomain: apexDomain,
            logoUrl: logoUrl,
            applicationType: "EXTERNAL_LINK",
            recipientEmail: null,
            recipientName: null,
            draftSubject: null,
            draftBody: null,
            isArchived: false,
          },
        });
      } else {
        const created = await prisma.jobOpportunity.create({
          data: {
            accountId,
            company: company.trim(),
            title: title.trim(),
            description: finalDescription,
            applyUrl: url?.trim() || null,
            location: location?.trim() || null,
            salary: normalizedSalary,
            salaryMax,
            status: "DISCOVERED",
            matchScore: 100,
            matchReason: "Tailored via Mail Pilot + Companion",
            companyDomain: apexDomain,
            logoUrl: logoUrl,
            isArchived: false,
            applicationType: "EXTERNAL_LINK",
            recipientEmail: null,
            recipientName: null,
            draftSubject: null,
            draftBody: null,
            classificationMethod: "CHROME_EXTENSION",
          },
          select: { id: true },
        });
        opportunityId = created.id;
      }
    } else {
      // Re-tailoring existing opportunity: ensure it stays marked as DISCOVERED and unarchived
      await prisma.jobOpportunity.update({
        where: { id: opportunityId },
        data: {
          company: company.trim(),
          title: title.trim(),
          description: finalDescription,
          applyUrl: url?.trim() || null,
          location: location?.trim() || null,
          salary: normalizedSalary,
          salaryMax,
          status: "DISCOVERED",
          matchScore: 100,
          matchReason: "Tailored via Mail Pilot + Companion",
          companyDomain: apexDomain,
          logoUrl: logoUrl,
          applicationType: "EXTERNAL_LINK",
          recipientEmail: null,
          recipientName: null,
          draftSubject: null,
          draftBody: null,
          isArchived: false,
        },
      });
    }

    const preview = await prepareOpportunityResume(accountId, opportunityId, {
      forceRegenerate: true,
      includeSummary,
      targetPages: pageBudget,
    });

    if (!preview) {
      return jsonWithCors(
        { ok: false, error: "Failed to generate tailored resume" },
        { status: 500, request }
      );
    }

    return jsonWithCors(
      {
        ok: true,
        opportunityId,
        preview,
      },
      { status: 200, request }
    );
  } catch (error) {
    console.error("[api/extension/tailor] Error:", error);
    return jsonWithCors(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Tailoring failed",
      },
      { status: 500, request }
    );
  }
}
