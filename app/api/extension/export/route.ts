import { getExtensionAccountId } from "@/lib/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/extension/cors";
import { compileResumeDocument } from "@/lib/opportunities/dispatch/resume";
import { exportSchema } from "@/lib/validations/extension";

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

  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400, request }
    );
  }

  const { opportunityId, format } = parsed.data;

  try {
    const compiled = await compileResumeDocument(accountId, opportunityId, format);
    return jsonWithCors(
      {
        ok: true,
        filename: compiled.filename,
        format,
        base64: format === "docx" ? compiled.docxBase64 : compiled.pdfBase64,
      },
      { status: 200, request }
    );
  } catch (error) {
    console.error("[api/extension/export] Error:", error);
    return jsonWithCors(
      { ok: false, error: error instanceof Error ? error.message : "Export failed" },
      { status: 500, request }
    );
  }
}
