import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSION_SETS } from "@/lib/rbac";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findInfluencer: vi.fn(),
  updateInfluencer: vi.fn(),
  updateCampaignRecords: vi.fn(),
  updateFollowUps: vi.fn(),
  transaction: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: {
    influencer: { findUnique: mocks.findInfluencer },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}

  return {
    UnauthorizedError,
    ForbiddenError,
    requireUser: mocks.requireUser,
  };
});

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: {
    DNC_SET: "influencer.dnc.set",
    DNC_CLEAR: "influencer.dnc.clear",
  },
  recordAudit: mocks.recordAudit,
}));

import { POST } from "@/app/api/influencers/[id]/dnc/route";

describe("influencer DNC route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireUser.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      status: "ACTIVE",
      roleKey: "ADMIN",
      roleName: "Administrator",
      permissions: DEFAULT_PERMISSION_SETS.ADMIN,
      sessionId: "session-1",
    });
    mocks.findInfluencer.mockResolvedValue({
      id: "influencer-1",
      dncFlag: true,
      dncReason: "Creator opted out.",
    });
    mocks.updateInfluencer.mockResolvedValue({});
    mocks.updateCampaignRecords
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.updateFollowUps.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          influencer: { update: typeof mocks.updateInfluencer };
          campaignInfluencer: { updateMany: typeof mocks.updateCampaignRecords };
          followUpTask: { updateMany: typeof mocks.updateFollowUps };
        }) => Promise<number>,
      ) =>
        callback({
          influencer: { update: mocks.updateInfluencer },
          campaignInfluencer: { updateMany: mocks.updateCampaignRecords },
          followUpTask: { updateMany: mocks.updateFollowUps },
        }),
    );
  });

  it("releases DNC campaign records without putting them back in the queue", async () => {
    const request = new Request("http://localhost/api/influencers/influencer-1/dnc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dnc: false,
        reason: "Creator contacted support and opted back in.",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "influencer-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, releasedRecords: 2 });
    expect(mocks.updateCampaignRecords).toHaveBeenNthCalledWith(1, {
      where: {
        influencerId: "influencer-1",
        outreachStatus: "DO_NOT_CONTACT",
      },
      data: {
        outreachStatus: "NOT_CONTACTED",
        pipelineStatus: "NONE",
        dueAt: null,
        dncOverrideById: null,
        dncOverrideAt: null,
        dncOverrideReason: null,
        version: { increment: 1 },
      },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "influencer.dnc.clear",
        newValues: expect.objectContaining({ releasedCampaignRecords: 2 }),
      }),
    );
  });
});
