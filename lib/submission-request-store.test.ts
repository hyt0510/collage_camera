import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), serial: Promise.resolve() as Promise<unknown> }));
vi.mock("@/lib/firebase-admin", () => ({ db: {
  collection: (name: string) => ({ doc: (id: string) => ({ key: `${name}/${id}` }) }),
  runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
    const task = state.serial.catch(() => {}).then(() => fn({
      get: async (ref: { key: string }) => ({ exists: state.docs.has(ref.key), get: (key: string) => state.docs.get(ref.key)?.[key], data: () => state.docs.get(ref.key) }),
      set: (ref: { key: string }, value: Record<string, unknown>) => state.docs.set(ref.key, value),
    }));
    state.serial = task;
    return task;
  },
} }));
vi.mock("@/lib/submission-store", () => ({ MAX_SUBMISSIONS_PER_USER: 10, MIN_SUBMISSION_INTERVAL_MS: 30_000,
  SubmissionLimitError: class extends Error { constructor(public reason: string) { super(reason); } },
}));
const { processSubmissionRequest } = await import("./submission-request-store");
import type { Submission } from "@/lib/submission-store";

const submission = (id: string) => ({ id, userId: "user", placement: { label: "A" }, status: "approved" }) as Submission;
beforeEach(() => { state.docs.clear(); state.serial = Promise.resolve(); });

describe("投稿再送の重複防止", () => {
  it.each([10, 100])("デモ用プリセットは投稿済みが%d件でも受け付ける", async (count) => {
    state.docs.set("submission_quotas/user", { count, lastAt: Date.now() - 30_000 });
    const result = await processSubmissionRequest("user", "request", "hash", async (id) => submission(id), "pre-festival-home");
    expect(result.userId).toBe("user");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(count + 1);
  });

  it.each(["festival-classic-a", undefined])("当日用またはプリセット未指定なら10回の上限を維持する（%s）", async (presetId) => {
    state.docs.set("submission_quotas/user", { count: 10, lastAt: Date.now() - 30_000 });
    await expect(processSubmissionRequest("user", "request", "hash", async (id) => submission(id), presetId)).rejects.toThrow("limit");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(10);
  });

  it("デモ用でも30秒以内の連続投稿は拒否する", async () => {
    state.docs.set("submission_quotas/user", { count: 100, lastAt: Date.now() });
    await expect(processSubmissionRequest("user", "request", "hash", async (id) => submission(id), "pre-festival-home")).rejects.toThrow("too_soon");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(100);
  });

  it("保存後の再送は検閲・保存を繰り返さず同じ結果を返す", async () => {
    const save = vi.fn(async (id: string) => {
      const value = submission(id);
      state.docs.set(`submissions/${id}`, value);
      return value;
    });
    const first = await processSubmissionRequest("user", "request", "hash", save);
    expect(await processSubmissionRequest("user", "request", "hash", save)).toEqual(first);
    expect(save).toHaveBeenCalledOnce();
    expect(state.docs.get("submission_quotas/user")?.count).toBe(1);
  });

  it("同時再送は処理中を返し、投稿枠を2回確保しない", async () => {
    let finish!: (value: Submission) => void;
    const first = processSubmissionRequest("user", "request", "hash", () => new Promise((resolve) => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeDefined());
    await expect(processSubmissionRequest("user", "request", "hash", async (id) => submission(id))).rejects.toThrow("処理中");
    finish(submission("saved"));
    await first;
    expect(state.docs.get("submission_quotas/user")?.count).toBe(1);
  });

  it("同じIDを別の内容に使い回すと拒否する", async () => {
    await processSubmissionRequest("user", "request", "hash", async (id) => submission(id));
    await expect(processSubmissionRequest("user", "request", "changed", async (id) => submission(id))).rejects.toThrow("内容");
  });

  it("保存失敗時は枠を返す", async () => {
    await expect(processSubmissionRequest("user", "request", "hash", async () => { throw new Error("storage failed"); })).rejects.toThrow("storage failed");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(0);
  });

  it("削除済み投稿を再送で復活させず、現在の表示状態を返す", async () => {
    const value = await processSubmissionRequest("user", "request", "hash", async (id) => {
      const saved = submission(id);
      state.docs.set(`submissions/${id}`, saved);
      return saved;
    });
    state.docs.set(`submissions/${value.id}`, { ...value, status: "hidden_manual" });
    expect((await processSubmissionRequest("user", "request", "hash", async () => { throw new Error("must not save"); })).status).toBe("hidden_manual");
    state.docs.delete(`submissions/${value.id}`);
    await expect(processSubmissionRequest("user", "request", "hash", async () => value)).rejects.toThrow("削除");
  });

  it("保存直後に処理が失敗しても、保存した投稿を回収し枠を返さない", async () => {
    const result = await processSubmissionRequest("user", "request", "hash", async (id) => {
      state.docs.set(`submissions/${id}`, submission(id));
      throw new Error("response lost");
    });
    expect(result.userId).toBe("user");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(1);
  });
});
