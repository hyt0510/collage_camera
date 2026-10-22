import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ count: 0, lastAt: 0 }));
vi.mock("./firebase-admin", () => ({
  bucket: { name: "test-bucket" },
  db: {
    collection: () => ({ doc: () => ({}) }),
    runTransaction: async (operation: (tx: unknown) => Promise<void>) => operation({
      get: async () => ({ get: (field: string) => field === "count" ? state.count : state.lastAt }),
      set: (_ref: unknown, value: { count: number; lastAt: number }) => Object.assign(state, value),
    }),
  },
}));

const { reserveSubmissionQuota } = await import("./submission-store");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T18:00:00+09:00"));
  state.count = 0;
  state.lastAt = Date.now() - 30_000;
});
afterEach(() => vi.useRealTimers());

describe("プリセットごとの投稿回数制限", () => {
  it.each([10, 100])("デモ用は%d件投稿済みでも受け付ける", async (count) => {
    state.count = count;
    await reserveSubmissionQuota("user", "pre-festival-home");
    expect(state.count).toBe(count + 1);
  });

  it.each(["festival-classic-a", "unknown", undefined])("デモ用以外は10回で拒否する（%s）", async (presetId) => {
    state.count = 10;
    await expect(reserveSubmissionQuota("user", presetId)).rejects.toMatchObject({ reason: "limit" });
    expect(state.count).toBe(10);
  });

  it("当日用は10回目まで受け付ける", async () => {
    state.count = 9;
    await reserveSubmissionQuota("user", "festival-classic-a");
    expect(state.count).toBe(10);
  });

  it("デモ用でも30秒以内の連続投稿は拒否する", async () => {
    state.count = 100;
    state.lastAt = Date.now() - 29_999;
    await expect(reserveSubmissionQuota("user", "pre-festival-home")).rejects.toMatchObject({ reason: "too_soon" });
    expect(state.count).toBe(100);
  });
});
