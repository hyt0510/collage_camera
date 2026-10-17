import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Firestore の代わり。交換記録と、投稿ごとの presetId だけを持つ
const state: { redeemedAt: string | null; presetIds: (string | undefined)[] } = { redeemedAt: null, presetIds: [] };
const created: unknown[] = [];
const redemptionSnapshot = () => ({ exists: state.redeemedAt !== null, get: () => state.redeemedAt ?? undefined });
const submissionsSnapshot = () => ({ docs: state.presetIds.map((presetId) => ({ get: () => presetId })) });
const redemptionRef = { path: "prize_redemptions/user-1", get: async () => redemptionSnapshot() };
const submissionsQuery = { path: "submissions?userId=user-1", get: async () => submissionsSnapshot() };
// 交換記録の全件取得（管理画面用）
const listRedemptions = vi.fn();

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: (name: string) => name === "prize_redemptions"
      ? { doc: () => redemptionRef, get: listRedemptions }
      : { where: () => submissionsQuery },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (target: unknown) => target === redemptionRef ? redemptionSnapshot() : submissionsSnapshot(),
      create: (_ref: unknown, data: unknown) => created.push(data),
    }),
  },
}));

const { getPrizeStatus, listPrizeRedemptions, redeemPrize } = await import("./prize-store");
const NOW = new Date("2026-10-15T01:00:00.000Z");
const FESTIVAL_PRESET = "festival-shards-6-v3";
const PRE_FESTIVAL_PRESET = "pre-festival-home";

describe("redeemPrize", () => {
  beforeEach(() => {
    state.redeemedAt = null;
    state.presetIds = [];
    created.length = 0;
  });

  it("投稿がなければ交換しない", async () => {
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "not_eligible" });
    expect(created).toHaveLength(0);
  });

  it("投稿があり未交換なら、交換を記録する", async () => {
    state.presetIds = [FESTIVAL_PRESET];
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "redeemed", redeemedAt: NOW.toISOString() });
    expect(created).toEqual([{ redeemedAt: NOW.toISOString() }]);
  });

  it("交換済みなら記録を増やさず、最初の交換時刻を返す", async () => {
    state.presetIds = [FESTIVAL_PRESET];
    state.redeemedAt = "2026-10-15T00:30:00.000Z";
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "already", redeemedAt: "2026-10-15T00:30:00.000Z" });
    expect(created).toHaveLength(0);
  });

  it("事前公開用プリセットの投稿だけなら交換しない", async () => {
    state.presetIds = [PRE_FESTIVAL_PRESET];
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "not_eligible" });
    expect(created).toHaveLength(0);
  });

  it("事前公開用と当日用の投稿が両方あれば交換する", async () => {
    state.presetIds = [PRE_FESTIVAL_PRESET, FESTIVAL_PRESET];
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "redeemed", redeemedAt: NOW.toISOString() });
  });

  it("presetId のない古い投稿でも交換する", async () => {
    state.presetIds = [undefined];
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "redeemed", redeemedAt: NOW.toISOString() });
  });
});

describe("getPrizeStatus", () => {
  beforeEach(() => {
    state.redeemedAt = null;
    state.presetIds = [];
  });

  it("事前公開用プリセットの投稿だけなら対象外を返す", async () => {
    state.presetIds = [PRE_FESTIVAL_PRESET];
    expect(await getPrizeStatus("user-1")).toEqual({ eligible: false, redeemedAt: null });
  });

  it("当日用の投稿があれば対象を返す", async () => {
    state.presetIds = [FESTIVAL_PRESET];
    expect(await getPrizeStatus("user-1")).toEqual({ eligible: true, redeemedAt: null });
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
