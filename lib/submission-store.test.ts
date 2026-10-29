import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), events: [] as string[], failSave: false, failPrivate: false, failDelete: false, failPublish: false, deleted: new Set<string>(), failDeletePath: "", imageContentType: "image/jpeg" }));
vi.mock("@/lib/operation-lock", () => ({ withOperationLock: async (_key: string, run: () => Promise<unknown>) => run() }));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (key: string, id: string) => ({
    key, id,
    get: async () => ({ exists: state.docs.has(key), id, get: (field: string) => state.docs.get(key)?.[field], data: () => state.docs.get(key) }),
    set: async (data: Record<string, unknown>) => { if (state.failSave) throw new Error("DB failed"); state.events.push("persist"); state.docs.set(key, structuredClone(data)); },
    update: async (data: Record<string, unknown>) => { state.docs.set(key, { ...state.docs.get(key), ...data }); },
    delete: async () => { state.docs.delete(key); },
  });
  return {
    db: {
      collection: (name: string) => ({ doc: (id = "new-id") => ref(`${name}/${id}`, id) }),
      batch: () => {
        const writes: Array<() => void> = [];
        return {
          update: (target: { key: string }, data: Record<string, unknown>) => writes.push(() => { state.docs.set(target.key, { ...state.docs.get(target.key), ...data }); }),
          set: (target: { key: string }, data: Record<string, unknown>) => writes.push(() => { state.docs.set(target.key, { ...state.docs.get(target.key), ...data }); }),
          commit: async () => {
            if (state.failSave) throw new Error("DB failed");
            writes.forEach((write) => write());
          },
        };
      },
      runTransaction: async (run: (tx: unknown) => Promise<unknown>) => run({
        get: async (target: { key: string }) => ({ get: (field: string) => state.docs.get(target.key)?.[field] }),
        update: (target: { key: string }, data: Record<string, unknown>) => state.docs.set(target.key, { ...state.docs.get(target.key), ...data }),
        set: (target: { key: string }, data: Record<string, unknown>) => state.docs.set(target.key, { ...state.docs.get(target.key), ...data }),
      }),
    },
    bucket: { name: "test-bucket", file: (path: string) => ({
      save: async (_buffer: unknown, options: { public: boolean; metadata: { cacheControl: string } }) => {
        state.events.push(options.public ? "upload-public" : "upload-private");
        expect(options.metadata.cacheControl).toBe("no-store");
      },
      setMetadata: async () => { if (state.deleted.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); },
      makePublic: async () => { if (state.failPublish) throw new Error("publish failed"); state.events.push("publish"); },
      makePrivate: async () => { if (state.failPrivate) throw new Error("private failed"); },
      download: async () => { if (state.deleted.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [Buffer.from(path)]; },
      getMetadata: async () => [{ contentType: state.imageContentType }],
      delete: async () => { if (state.failDelete || path === state.failDeletePath) throw new Error("delete failed"); state.deleted.add(path); },
    }) },
  };
});
const { createSubmission, updateSubmissionStatus, deleteSubmission, reserveSubmissionQuota, getSubmissionImage } = await import("./submission-store");
const input = { userId: "user", templateId: "shards-a", presetId: "festival-classic-a", prizeEligible: true,
  status: "approved" as const, moderation: { safe: true, source: "cloud-vision" as const, reason: "ok" },
  collage: { buffer: Buffer.from("test"), contentType: "image/jpeg" as const, extension: "jpg" as const }, items: [],
};
beforeEach(() => {
  state.imageContentType = "image/jpeg";
  state.docs.clear(); state.events = []; state.deleted.clear(); state.failDeletePath = "";
  state.failSave = state.failPrivate = state.failDelete = state.failPublish = false;
});

describe("画像公開・非表示・削除の失敗時", () => {
  it("承認時に投稿一覧の更新番号を保存する", async () => {
    await createSubmission(input);
    expect(state.docs.get("settings/submissionVersion")?.version).toBeTypeOf("string");
  });
  it("画像の非公開化に失敗しても、非表示と同時に更新番号が変わる", async () => {
    await createSubmission(input);
    const previous = state.docs.get("settings/submissionVersion")?.version;
    state.failPrivate = true;
    await expect(updateSubmissionStatus("new-id", "hide")).rejects.toThrow("非公開化に失敗");
    expect(state.docs.get("settings/submissionVersion")?.version).toBeTypeOf("string");
    expect(state.docs.get("settings/submissionVersion")?.version).not.toBe(previous);
  });
  it("更新番号の保存に失敗したら表示状態も変更しない", async () => {
    await createSubmission(input);
    const previous = state.docs.get("settings/submissionVersion")?.version;
    state.failSave = true;
    await expect(updateSubmissionStatus("new-id", "hide")).rejects.toThrow("DB failed");
    expect(state.docs.get("submissions/new-id")?.status).toBe("approved");
    expect(state.docs.get("settings/submissionVersion")?.version).toBe(previous);
  });
  it("画像の削除に失敗しても更新番号を変えてモニターから外す", async () => {
    await createSubmission(input);
    const previous = state.docs.get("settings/submissionVersion")?.version;
    state.failDelete = true;
    await expect(deleteSubmission("new-id")).rejects.toThrow("delete failed");
    expect(state.docs.get("submissions/new-id")?.status).toBe("hidden_manual");
    expect(state.docs.get("settings/submissionVersion")?.version).toBeTypeOf("string");
    expect(state.docs.get("settings/submissionVersion")?.version).not.toBe(previous);
  });
  it("画像を非公開で保存し、管理可能な記録ができてから公開する", async () => {
    const result = await createSubmission(input);
    expect(state.events).toEqual(["upload-private", "persist", "publish"]);
    expect(result.status).toBe("approved");
  });
  it("DB保存に失敗した画像を公開しない", async () => {
    state.failSave = true;
    await expect(createSubmission(input)).rejects.toThrow("DB failed");
    expect(state.events).toEqual(["upload-private"]);
  });
  it("公開に失敗しても手動確認できる記録を残す", async () => {
    state.failPublish = true;
    await expect(createSubmission(input)).rejects.toThrow("publish failed");
    expect(state.docs.get("submissions/new-id")?.status).toBe("pending_manual");
  });
  it("非公開化の失敗は成功扱いにせず、表示を先に止める", async () => {
    await createSubmission(input);
    state.failPrivate = true;
    await expect(updateSubmissionStatus("new-id", "hide")).rejects.toThrow("非公開化に失敗");
    expect(state.docs.get("submissions/new-id")?.status).toBe("hidden_manual");
  });
  it("画像削除の失敗時は記録を残し、再操作で削除できる", async () => {
    const id = "a".repeat(64);
    await createSubmission({ ...input, submissionId: id });
    state.failDelete = true;
    await expect(deleteSubmission(id)).rejects.toThrow("delete failed");
    expect(state.docs.get(`submissions/${id}`)?.status).toBe("hidden_manual");
    expect(state.docs.get(`submission_requests/${id}`)?.deleted).toBe(true);
    state.failDelete = false;
    expect(await deleteSubmission(id)).toBe(true);
    expect(state.docs.has(`submissions/${id}`)).toBe(false);
  });
  it("一部の画像だけ削除済みでも、次の操作で残りを削除できる", async () => {
    const id = "b".repeat(64);
    state.docs.set(`submissions/${id}`, {
      id, status: "approved", collageImageUrl: "https://storage.googleapis.com/test-bucket/a.jpg",
      items: [{ polygonId: "a1", theme: "QA", imageUrl: "https://storage.googleapis.com/test-bucket/b.jpg" }],
    });
    state.failDeletePath = "b.jpg";
    await expect(deleteSubmission(id)).rejects.toThrow("delete failed");
    expect(state.deleted.has("a.jpg")).toBe(true);
    state.failDeletePath = "";
    expect(await deleteSubmission(id)).toBe(true);
    expect(state.deleted.has("b.jpg")).toBe(true);
  });

});

describe("プリセットごとの投稿回数制限", () => {
  it.each([10, 100])("デモ用は%d件投稿済みでも受け付ける", async (count) => {
    state.docs.set("submission_quotas/user", { count, lastAt: Date.now() - 30_000 });
    await reserveSubmissionQuota("user", "pre-festival-home");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(count + 1);
  });

  it.each(["festival-classic-a", "unknown", undefined])("デモ用以外は10回で拒否する（%s）", async (presetId) => {
    state.docs.set("submission_quotas/user", { count: 10, lastAt: Date.now() - 30_000 });
    await expect(reserveSubmissionQuota("user", presetId)).rejects.toMatchObject({ reason: "limit" });
    expect(state.docs.get("submission_quotas/user")?.count).toBe(10);
  });

  it("当日用は10回目まで受け付ける", async () => {
    state.docs.set("submission_quotas/user", { count: 9, lastAt: Date.now() - 30_000 });
    await reserveSubmissionQuota("user", "festival-classic-a");
    expect(state.docs.get("submission_quotas/user")?.count).toBe(10);
  });

  it("デモ用でも30秒以内の連続投稿は拒否する", async () => {
    state.docs.set("submission_quotas/user", { count: 100, lastAt: Date.now() });
    await expect(reserveSubmissionQuota("user", "pre-festival-home")).rejects.toMatchObject({ reason: "too_soon" });
    expect(state.docs.get("submission_quotas/user")?.count).toBe(100);
  });
});


describe("印刷用画像の読み出し", () => {
  const url = "https://storage.googleapis.com/test-bucket/submissions/work-1.jpg";
  it("投稿記録にある自分のバケットの完成画像を返す", async () => {
    state.docs.set("submissions/work-1", { collageImageUrl: url, items: [] });
    const image = await getSubmissionImage("work-1");
    expect(image?.buffer.toString()).toBe("submissions/work-1.jpg");
    expect(image?.contentType).toBe("image/jpeg");
  });
  it("存在しない投稿・削除済みの画像は返さない", async () => {
    expect(await getSubmissionImage("missing")).toBeNull();
    state.docs.set("submissions/work-1", { collageImageUrl: url, items: [] });
    state.deleted.add("submissions/work-1.jpg");
    expect(await getSubmissionImage("work-1")).toBeNull();
  });
  it.each([
    "https://example.com/private.jpg",
    "https://storage.googleapis.com/other-bucket/submissions/private.jpg",
    "https://storage.googleapis.com/test-bucket/secrets/private.jpg",
  ])("投稿以外の場所を参照する画像は返さない（%s）", async collageImageUrl => {
    state.docs.set("submissions/work-1", { collageImageUrl, items: [] });
    expect(await getSubmissionImage("work-1")).toBeNull();
  });
  it("画像以外の内容を配信しない", async () => {
    state.docs.set("submissions/work-1", { collageImageUrl: url, items: [] });
    state.imageContentType = "text/html";
    expect(await getSubmissionImage("work-1")).toBeNull();
  });
});
