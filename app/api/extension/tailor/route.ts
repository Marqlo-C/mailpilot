import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { getExtensionAccountId } from "@/lib/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/extension/cors";
import { prepareOpportunityResume } from "@/lib/opportunities/dispatch/resume";

const tailorRequestSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  title: z.string().min(1, "Job title is required"),
  description: z.string().min(1, "Job description is required"),
  url: z.string().url().optional().or(z.literal("")).or(z.null()),
  location: z.string().optional().or(z.null()),
  salary: z.string().optional().or(z.null()),
  pageBudget: z.union([z.literal("auto"), z.literal(1), z.literal(2)]).optional().default("auto"),
  includeSummary: z.boolean().optional().default(true),
  opportunityId: z.string().optional().or(z.null()),
});

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
    pageBudget,
    includeSummary,
    opportunityId: incomingOppId,
  } = parsed.data;

  try {
    let opportunityId = incomingOppId;

    if (opportunityId) {
      const existing = await prisma.jobOpportunity.findFirst({
        where: { id: opportunityId, accountId },
        select: { id: true },
      });
      if (!existing) {
        opportunityId = undefined;
      }
    }

    if (!opportunityId) {
      const existingLead = await prisma.jobOpportunity.findFirst({
        where: {
          accountId,
          company: { equals: company.trim(), mode: "insensitive" },
          title: { equals: title.trim(), mode: "insensitive" },
          status: "LEAD",
        },
        select: { id: true },
      });

      if (existingLead) {
        opportunityId = existingLead.id;
        await prisma.jobOpportunity.update({
          where: { id: opportunityId },
          data: {
            description: description.trim(),
            applyUrl: url?.trim() || undefined,
            location: location?.trim() || undefined,
            salary: salary?.trim() || undefined,
            isArchived: false,
          },
        });
      } else {
        const created = await prisma.jobOpportunity.create({
          data: {
            accountId,
            company: company.trim(),
            title: title.trim(),
            description: description.trim(),
            applyUrl: url?.trim() || null,
            location: location?.trim() || null,
            salary: salary?.trim() || null,
            status: "LEAD",
            isArchived: false,
            applicationType: "EXTERNAL_LINK",
            classificationMethod: "CHROME_EXTENSION",
          },
          select: { id: true },
        });
        opportunityId = created.id;
      }
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
