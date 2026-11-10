import { getExtensionAccountId } from "@/lib/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/extension/cors";
import { reorderResumeDraftNode } from "@/lib/opportunities/dispatch/resume";
import { reorderNodeSchema } from "@/lib/validations/extension";

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

  const parsed = reorderNodeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400, request }
    );
  }

  const { opportunityId, nodeId, direction } = parsed.data;

  try {
    const updated = await reorderResumeDraftNode(
      accountId,
      opportunityId,
      nodeId,
      direction
    );
    return jsonWithCors({ ok: true, preview: updated }, { status: 200, request });
  } catch (error) {
    console.error("[api/extension/draft/reorder] Error:", error);
    return jsonWithCors(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reorder node" },
      { status: 500, request }
    );
  }
}
