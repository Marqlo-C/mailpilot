import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import {
  describeProfileRevision,
  parseRevisionSummary,
  serializeRevisionSummary,
} from "@/lib/profile/revision-diff";
import {
  listProfileRevisions,
  loadProfileSnapshot,
  pruneProfileHistory,
  recordProfileSnapshot,
  serializeUserProfileToInput,
} from "@/lib/profile/profile-history";
import { parseAccountRules } from "@/lib/validations/rules.schema";
import type { MasterProfileUpdateInput } from "@/lib/validations/profile.schema";
import { updateMasterProfile } from "./profile-snapshot.service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ProfileHistoryItem = {
  id: string;
  summary: string;
  createdAt: string;
  isCurrent: boolean;
};

export function canonicalSnapshot(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSnapshot(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSnapshot(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Records the current profile in ProfileHistory before a destructive write.
 * Returns the profile id when a snapshot was stored.
 */
export async function captureProfileRevision(
  accountId: string,
  summary: string
): Promise<string | null> {
  const [existingTree, settings] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { accountId },
      include: {
        experiences: { orderBy: { displayOrder: "asc" } },
        projects: true,
        education: true,
      },
    }),
    prisma.accountSettings.findUnique({
      where: { accountId },
    }),
  ]);
  if (!existingTree) return null;
  const rules = parseAccountRules(settings?.rules);
  await recordProfileSnapshot(
    existingTree.id,
    summary,
    serializeUserProfileToInput(existingTree, rules.projectMeta)
  );
  return existingTree.id;
}

/**
 * Lists the last 4 profile copies (newest first). The first row is the current profile.
 */
export async function getProfileHistory(
  accountId: string
): Promise<ActionResult<ProfileHistoryItem[]>> {
  return { ok: true, data: await listProfileRevisions(accountId) };
}

/**
 * Writes a stored copy onto the live profile and moves that copy to the front.
 * The outgoing live profile stays in history as the next rollback row.
 */
export async function restoreProfileHistory(
  accountId: string,
  historyId: string
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: true },
  });
  if (!account?.profile) return { ok: false, error: "Profile not found" };

  const target = await prisma.profileHistory.findUnique({
    where: { id: historyId },
  });
  if (!target || target.profileId !== account.profile.id) {
    return { ok: false, error: "Revision not found" };
  }

  const newest = await prisma.profileHistory.findFirst({
    where: { profileId: account.profile.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, snapshot: true },
  });
  if (newest?.id === historyId) {
    return { ok: true };
  }

  const live = await loadProfileSnapshot(account.profile.id);
  if (
    live &&
    (!newest || canonicalSnapshot(newest.snapshot) !== canonicalSnapshot(live))
  ) {
    const summary = newest
      ? serializeRevisionSummary(
          describeProfileRevision(newest.snapshot as MasterProfileUpdateInput, live)
        )
      : "Profile update";
    await prisma.profileHistory.create({
      data: {
        profileId: account.profile.id,
        summary,
        snapshot: live as Prisma.InputJsonValue,
      },
    });
  }

  const restoredData = target.snapshot as MasterProfileUpdateInput;
  const result = await updateMasterProfile(accountId, restoredData, {
    skipHistory: true,
  });
  if (!result.ok) {
    await pruneProfileHistory(account.profile.id);
    return result;
  }

  const recorded = parseRevisionSummary(target.summary);
  await prisma.profileHistory.update({
    where: { id: historyId },
    data: {
      // Sort this copy to the front without replacing the time it was stored.
      createdAt: new Date(),
      summary: serializeRevisionSummary({
        title: recorded.title,
        diff: recorded.diff,
        storedAt: recorded.storedAt ?? target.createdAt.toISOString(),
      }),
    },
  });
  await pruneProfileHistory(account.profile.id);

  return { ok: true };
}

/**
 * Renames a revision the account owns. The stored snapshot stays unchanged.
 */
export async function renameProfileRevision(
  accountId: string,
  revisionId: string,
  newName: string
): Promise<ActionResult> {
  const name = newName.trim();
  if (!name || name.length > 160) {
    return { ok: false, error: "Revision name must be 1–160 characters." };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: { select: { id: true } } },
  });
  if (!account?.profile) return { ok: false, error: "Profile not found" };

  const target = await prisma.profileHistory.findUnique({
    where: { id: revisionId },
    select: { id: true, profileId: true, summary: true },
  });
  if (!target || target.profileId !== account.profile.id) {
    return { ok: false, error: "Revision not found" };
  }

  const stored = parseRevisionSummary(target.summary);
  await prisma.profileHistory.update({
    where: { id: revisionId },
    data: {
      summary: serializeRevisionSummary({
        title: name,
        diff: stored.diff,
        storedAt: stored.storedAt,
      }),
    },
  });
  return { ok: true };
}
