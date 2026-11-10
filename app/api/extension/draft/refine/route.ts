import { getExtensionAccountId } from "@/lib/utils/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/utils/extension/cors";
import { refineSingleResumeNode } from "@/lib/opportunities/dispatch/resume";
import { refineNodeSchema } from "@/lib/validations/extension.schema";

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

  const parsed = refineNodeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400, request }
    );
  }

  const { opportunityId, nodeId, instruction } = parsed.data;

  try {
    const updated = await refineSingleResumeNode(
      accountId,
      opportunityId,
      nodeId,
      instruction
    );
    return jsonWithCors({ ok: true, preview: updated }, { status: 200, request });
  } catch (error) {
    console.error("[api/extension/draft/refine] Error:", error);
    return jsonWithCors(
      { ok: false, error: error instanceof Error ? error.message : "Failed to refine node" },
      { status: 500, request }
    );
  }
}
