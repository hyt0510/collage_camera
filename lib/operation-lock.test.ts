import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/lib/firebase-admin", () => ({ db: {
  collection: () => ({ doc: () => ({}) }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    get: async () => ({ get: (key: string) => state.value[key] }),
    set: (_ref: unknown, value: Record<string, unknown>) => { state.value = value; },
    update: (_ref: unknown, value: Record<string, unknown>) => { state.value = { ...state.value, ...value }; },
  }),
} }));
const { withOperationLock, withSubmissionActivity, withSubmissionReset } = await import("./operation-lock");
beforeEach(() => { state.value = {}; });

it("実行中の管理操作に重なる操作は拒否し、終了後は再実行できる", async () => {
  let finish!: () => void;
  const first = withOperationLock("admin", () => new Promise<void>((resolve) => { finish = resolve; }));
  await vi.waitFor(() => expect(finish).toBeDefined());
  await expect(withOperationLock("admin", async () => true)).rejects.toThrow("処理中");
  finish();
  await first;
  expect(await withOperationLock("admin", async () => "ok")).toBe("ok");
});

it("処理失敗時にもロックを返す", async () => {
  await expect(withOperationLock("admin", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  expect(await withOperationLock("admin", async () => true)).toBe(true);
});

it("停止したサーバーの古いロックは期限後に回収できる", async () => {
  state.value = { token: "old", expiresAt: Date.now() - 1 };
  expect(await withOperationLock("admin", async () => true)).toBe(true);
});

it("投稿の受付から完了まで一括削除を拒否し、終了後は削除できる", async () => {
  let finish!: () => void;
  const first = withSubmissionActivity(() => new Promise<void>((resolve) => { finish = resolve; }));
  await vi.waitFor(() => expect(finish).toBeDefined());
  await expect(withSubmissionReset(async () => true)).rejects.toThrow("処理中");
  finish();
  await first;
  expect(await withSubmissionReset(async () => true)).toBe(true);
});

it("一括削除中は新しい投稿を受け付けない", async () => {
  let finish!: () => void;
  const reset = withSubmissionReset(() => new Promise<void>((resolve) => { finish = resolve; }));
  await vi.waitFor(() => expect(finish).toBeDefined());
  await expect(withSubmissionActivity(async () => true)).rejects.toThrow("処理中");
  finish();
  await reset;
  expect(await withSubmissionActivity(async () => true)).toBe(true);
});
