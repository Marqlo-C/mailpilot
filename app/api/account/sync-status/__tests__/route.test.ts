import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/data", () => ({
  getActiveAccount: vi.fn(),
}));

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailMessage: {
      count: vi.fn(),
    },
  },
}));

import { getActiveAccount } from "@/lib/data";
import { prisma } from "@/lib/core/prisma";
import { GET } from "../route";

describe("Sync Status Route (/api/account/sync-status)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns opportunitiesAdded from account settings rules when not syncing", async () => {
    vi.mocked(getActiveAccount).mockResolvedValueOnce({
      id: "acc_1",
      email: "user@example.com",
    } as any);

    vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
      id: "acc_1",
      isSyncing: false,
      lastSyncedAt: new Date(),
      syncError: null,
      lastSyncProcessed: 10,
      syncTotal: null,
      syncKind: null,
      syncPendingTotal: null,
      lastSyncPendingProcessed: null,
      updatedAt: new Date(),
      syncHeartbeatAt: new Date(),
      settings: {
        rules: {
          lastSyncCreatedCount: 4,
        },
      },
    } as any);

    vi.mocked(prisma.emailMessage.count).mockResolvedValueOnce(0);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSyncing).toBe(false);
    expect(data.opportunitiesAdded).toBe(4);
  });

  it("returns opportunitiesAdded as null while actively syncing", async () => {
    vi.mocked(getActiveAccount).mockResolvedValueOnce({
      id: "acc_1",
      email: "user@example.com",
    } as any);

    vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
      id: "acc_1",
      isSyncing: true,
      lastSyncedAt: new Date(),
      syncError: null,
      lastSyncProcessed: 2,
      syncTotal: 10,
      syncKind: "inbox",
      syncPendingTotal: null,
      lastSyncPendingProcessed: null,
      updatedAt: new Date(),
      syncHeartbeatAt: new Date(),
      settings: {
        rules: {
          lastSyncCreatedCount: 4,
        },
      },
    } as any);

    vi.mocked(prisma.emailMessage.count).mockResolvedValueOnce(0);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSyncing).toBe(true);
    expect(data.opportunitiesAdded).toBeNull();
  });

  it("falls back to account.lastSyncProcessed when rules has no lastSyncCreatedCount", async () => {
    vi.mocked(getActiveAccount).mockResolvedValueOnce({
      id: "acc_1",
      email: "user@example.com",
    } as any);

    vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
      id: "acc_1",
      isSyncing: false,
      lastSyncedAt: new Date(),
      syncError: null,
      lastSyncProcessed: 3,
      syncTotal: null,
      syncKind: null,
      syncPendingTotal: null,
      lastSyncPendingProcessed: null,
      updatedAt: new Date(),
      syncHeartbeatAt: new Date(),
      settings: null,
    } as any);

    vi.mocked(prisma.emailMessage.count).mockResolvedValueOnce(0);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSyncing).toBe(false);
    expect(data.opportunitiesAdded).toBe(3);
  });
});
