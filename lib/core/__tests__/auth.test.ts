import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, getAuthenticatedAccountId, getSessionToken } from "../auth";
import { prisma } from "../prisma";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../constants";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("../prisma", () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
    },
  },
}));

describe("lib/core/auth", () => {
  const mockCookieStore = {
    get: vi.fn(),
    delete: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any);
  });

  describe("getSessionToken", () => {
    it("returns null when session cookie is absent", async () => {
      mockCookieStore.get.mockReturnValueOnce(undefined);
      expect(await getSessionToken()).toBeNull();
    });

    it("returns trimmed token when session cookie is present", async () => {
      mockCookieStore.get.mockReturnValueOnce({ value: "  acc_token_123  " });
      expect(await getSessionToken()).toBe("acc_token_123");
    });
  });

  describe("getAuthenticatedAccountId", () => {
    it("returns null when no session token is present", async () => {
      mockCookieStore.get.mockReturnValueOnce(undefined);
      expect(await getAuthenticatedAccountId()).toBeNull();
    });

    it("returns account ID when account exists and is active", async () => {
      mockCookieStore.get.mockReturnValueOnce({ value: "acc_token_123" });
      vi.mocked(prisma.account.findFirst).mockResolvedValueOnce({
        id: "acc_token_123",
      } as any);

      expect(await getAuthenticatedAccountId()).toBe("acc_token_123");
      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: "acc_token_123", isActive: true },
        select: { id: true },
      });
    });

    it("returns null when account does not exist in DB", async () => {
      mockCookieStore.get.mockReturnValueOnce({ value: "acc_token_123" });
      vi.mocked(prisma.account.findFirst).mockResolvedValueOnce(null);

      expect(await getAuthenticatedAccountId()).toBeNull();
    });
  });

  describe("auth() helper", () => {
    it("returns null when user is unauthenticated", async () => {
      mockCookieStore.get.mockReturnValueOnce(undefined);
      expect(await auth()).toBeNull();
    });

    it("returns AuthSession object when user is authenticated", async () => {
      mockCookieStore.get.mockReturnValueOnce({ value: "acc_123" });
      vi.mocked(prisma.account.findFirst).mockResolvedValueOnce({
        id: "acc_123",
      } as any);

      const session = await auth();
      expect(session).toEqual({
        accountId: "acc_123",
        user: { id: "acc_123" },
      });
    });
  });
});
