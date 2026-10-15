import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Firestore の代わり。交換記録と投稿の有無だけを持つ
const state: { redeemedAt: string | null; hasSubmission: boolean } = { redeemedAt: null, hasSubmission: false };
const created: unknown[] = [];
const redemptionRef = { path: "prize_redemptions/user-1" };
const submissionsQuery = { path: "submissions?userId=user-1" };
// 交換記録の全件取得（管理画面用）
const listRedemptions = vi.fn();

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: (name: string) => name === "prize_redemptions"
      ? { doc: () => redemptionRef, get: listRedemptions }
      : { where: () => ({ limit: () => submissionsQuery }) },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (target: unknown) => target === redemptionRef
        ? { exists: state.redeemedAt !== null, get: () => state.redeemedAt ?? undefined }
        : { empty: !state.hasSubmission },
      create: (_ref: unknown, data: unknown) => created.push(data),
    }),
  },
}));

const { listPrizeRedemptions, redeemPrize } = await import("./prize-store");
const NOW = new Date("2026-10-15T01:00:00.000Z");

describe("redeemPrize", () => {
  beforeEach(() => {
    state.redeemedAt = null;
    state.hasSubmission = false;
    created.length = 0;
  });

  it("投稿がなければ交換しない", async () => {
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "not_eligible" });
    expect(created).toHaveLength(0);
  });

  it("投稿があり未交換なら、交換を記録する", async () => {
    state.hasSubmission = true;
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "redeemed", redeemedAt: NOW.toISOString() });
    expect(created).toEqual([{ redeemedAt: NOW.toISOString() }]);
  });

  it("交換済みなら記録を増やさず、最初の交換時刻を返す", async () => {
    state.hasSubmission = true;
    state.redeemedAt = "2026-10-15T00:30:00.000Z";
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "already", redeemedAt: "2026-10-15T00:30:00.000Z" });
    expect(created).toHaveLength(0);
  });
});

describe("listPrizeRedemptions", () => {
  beforeEach(() => {
    listRedemptions.mockReset();
  });

  it("UID ごとの交換時刻を返す", async () => {
    listRedemptions.mockResolvedValue({
      docs: [{ id: "user-1", get: () => "2026-10-15T00:30:00.000Z" }],
    });
    expect(await listPrizeRedemptions()).toEqual({ "user-1": "2026-10-15T00:30:00.000Z" });
  });

  it("取得に失敗したら投げずに null を返す（管理画面の投稿一覧を止めないため）", async () => {
    listRedemptions.mockRejectedValue(new Error("unavailable"));
    expect(await listPrizeRedemptions()).toBeNull();
  });
});
