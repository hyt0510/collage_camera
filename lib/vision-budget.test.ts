import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ attempts: 0, transactions: vi.fn(), fail: false }));
vi.mock("@/lib/firebase-admin", () => ({ db: {
  collection: () => ({ doc: () => ({}) }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    state.transactions();
    if (state.fail) throw new Error("offline");
    return fn({ get: async () => ({ exists: true, get: () => state.attempts }), set: (_ref: unknown, value: { attempts: number }) => { state.attempts = value.attempts; } });
  },
} }));
const { reserveVisionRequest } = await import("./vision-budget");
beforeEach(() => { state.attempts = 0; state.fail = false; state.transactions.mockClear(); vi.stubEnv("VISION_FREE_REQUESTS_REMAINING", "2"); });
afterEach(() => vi.unstubAllEnvs());
describe("検閲の無料枠予算", () => {
  it("確認済みの残枠を使い切ったら追加の検閲を許可しない", async () => {
    expect(await reserveVisionRequest()).toBe(true);
    expect(await reserveVisionRequest()).toBe(true);
    expect(await reserveVisionRequest()).toBe(false);
    expect(state.attempts).toBe(2);
  });
  it.each(["", "invalid", "1001", "-1", "1.5"])("残枠が未設定・不正なら検閲もFirebase読み取りもしない（%s）", async value => {
    vi.stubEnv("VISION_FREE_REQUESTS_REMAINING", value);
    expect(await reserveVisionRequest()).toBe(false);
    expect(state.transactions).not.toHaveBeenCalled();
  });
  it("予算確認に失敗したら外部検閲に進まない", async () => {
    state.fail = true;
    await expect(reserveVisionRequest()).rejects.toThrow("offline");
  });
});
