import { getMasterProfile } from "@/app/actions/profile";
import { prisma } from "@/lib/core/prisma";
import { getExtensionAccountId } from "@/lib/extension/auth";
import { handleOptionsCors, jsonWithCors } from "@/lib/extension/cors";

export async function OPTIONS(request: Request) {
  return handleOptionsCors(request);
}

export async function GET(request: Request) {
  const accountId = await getExtensionAccountId(request);
  if (!accountId) {
    return jsonWithCors(
      { ok: false, error: "Unauthorized: No active MailPilot session found" },
      { status: 401, request }
    );
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      email: true,
      name: true,
      picture: true,
      isActive: true,
    },
  });

  if (!account) {
    return jsonWithCors(
      { ok: false, error: "Account not found or inactive" },
      { status: 404, request }
    );
  }

  const profileResult = await getMasterProfile(accountId);

  return jsonWithCors(
    {
      ok: true,
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        picture: account.picture,
      },
      profile: profileResult.ok && profileResult.data ? {
        fullName: profileResult.data.fullName,
        summary: profileResult.data.summary,
        email: profileResult.data.email,
        phone: profileResult.data.phone,
        location: profileResult.data.location,
        skills: profileResult.data.skills,
        experienceCount: profileResult.data.experiences?.length ?? 0,
        projectCount: profileResult.data.projects?.length ?? 0,
      } : null,
    },
    { status: 200, request }
  );
}
