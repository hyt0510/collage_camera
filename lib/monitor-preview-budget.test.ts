import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ value: null as Record<string, unknown> | null, queue: Promise.resolve() }));
vi.mock("@/lib/firebase-admin", () => {
  const snapshot = () => ({ exists: state.value !== null, get: (key: string) => state.value?.[key] });
  return { db: {
    collection: (collection: string) => ({ doc: (id: string) => {
      expect(`${collection}/${id}`).toBe("settings/monitorPreviewBudget");
      return { get: async () => snapshot() };
    } }),
    runTransaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = state.queue.then(() => run({
        get: async () => snapshot(),
        set: (_ref: unknown, value: Record<string, unknown>) => { state.value = structuredClone(value); },
        update: (_ref: unknown, value: Record<string, unknown>) => { state.value = { ...state.value, ...value }; },
      }));
      state.queue = result.then(() => undefined, () => undefined);
      return result;
    },
  } };
});
const { reserveMonitorPreviewPublication: reserve, completeMonitorPreviewPublication: complete, assertMonitorPreviewIdle: idle } = await import("./monitor-preview-budget");
const { MONITOR_CLOSES_AT } = await import("./monitor-schedule");
const now = Date.parse("2026-10-31T10:00:00+09:00");
beforeEach(() => { state.value = null; state.queue = Promise.resolve(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("プレビュー公開の永続上限", () => {
  it("初回予約を永続化し、完了まで非表示操作を保留する", async () => {
    const id = await reserve(now);
    expect(state.value).toMatchObject({ eventId: MONITOR_CLOSES_AT, reservedCount: 1, lastReservedAt: now, pendingId: id, pendingUntil: now + 90_000 });
    await expect(idle()).rejects.toMatchObject({ reason: "pending" });
    await complete(id);
    await expect(idle()).resolves.toBeUndefined();
    expect(state.value?.reservedCount).toBe(1);
  });
  it("60秒未満を拒否し、60秒ちょうどなら次の予約ができる", async () => {
    await complete(await reserve(now));
    vi.setSystemTime(now + 59_999);
    await expect(reserve(Date.now())).rejects.toMatchObject({ reason: "interval" });
    vi.setSystemTime(now + 60_000);
    await reserve(Date.now());
    expect(state.value?.reservedCount).toBe(2);
  });
  it("1499回から1500回までは受け付け、その後は上限を戻さない", async () => {
    state.value = { eventId: MONITOR_CLOSES_AT, reservedCount: 1499, lastReservedAt: now - 60_000, pendingId: "", pendingUntil: 0 };
    await complete(await reserve(now));
    vi.setSystemTime(now + 60_000);
    await expect(reserve(Date.now())).rejects.toMatchObject({ reason: "limit" });
    expect(state.value?.reservedCount).toBe(1500);
  });
  it("同時予約は1回だけ成功する", async () => {
    const results = await Promise.allSettled([reserve(now), reserve(now)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(state.value?.reservedCount).toBe(1);
  });
  it("失敗した予約の保留は90秒後に解け、回数は消費したままにする", async () => {
    await reserve(now);
    vi.setSystemTime(now + 89_999);
    await expect(idle()).rejects.toMatchObject({ reason: "pending" });
    vi.setSystemTime(now + 90_000);
    await idle();
    await reserve(Date.now());
    expect(state.value?.reservedCount).toBe(2);
  });
  it("古い処理の完了では別の保留を解除しない", async () => {
    const first = await reserve(now);
    vi.setSystemTime(now + 90_000);
    const second = await reserve(Date.now());
    await complete(first);
    expect(state.value?.pendingId).toBe(second);
    await expect(idle()).rejects.toMatchObject({ reason: "pending" });
  });
  it.each([NaN, now + 1, now - 90_000])("不正・期限切れの開始時刻 %s では予約しない", async (startedAt) => {
    await expect(reserve(startedAt)).rejects.toMatchObject({ reason: "expired" });
    expect(state.value).toBeNull();
  });
  it.each([
    { eventId: 1, reservedCount: 0, lastReservedAt: 0, pendingId: "", pendingUntil: 0 },
    { eventId: MONITOR_CLOSES_AT, reservedCount: -1, lastReservedAt: 0, pendingId: "", pendingUntil: 0 },
    { eventId: MONITOR_CLOSES_AT, reservedCount: 0, lastReservedAt: "bad", pendingId: "", pendingUntil: 0 },
    { eventId: MONITOR_CLOSES_AT, reservedCount: 0, lastReservedAt: 0, pendingId: "x", pendingUntil: Infinity },
  ])("壊れた管理データを初期化して上限をすり抜けない", async (value) => {
    state.value = value;
    await expect(reserve(now)).rejects.toThrow();
    expect(state.value).toEqual(value);
  });
});
