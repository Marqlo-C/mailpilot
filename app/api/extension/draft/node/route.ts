import { getExtensionAccountId } from "@/lib/utils/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/utils/extension/cors";
import { updateResumeDraftNode } from "@/lib/opportunities/dispatch/resume";
import { patchNodeSchema } from "@/lib/validations/extension.schema";

export async function OPTIONS(request: Request) {
  return handleOptionsCors(request);
}

export async function PATCH(request: Request) {
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

  const parsed = patchNodeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400, request }
    );
  }

  const { opportunityId, nodeId, content, selected } = parsed.data;

  try {
    const updated = await updateResumeDraftNode(accountId, opportunityId, nodeId, {
      content,
      selected,
    });
    return jsonWithCors({ ok: true, preview: updated }, { status: 200, request });
  } catch (error) {
    console.error("[api/extension/draft/node] Error:", error);
    return jsonWithCors(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update node" },
      { status: 500, request }
    );
  }
}
