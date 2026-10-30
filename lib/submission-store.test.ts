import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), events: [] as string[], failSave: false, failPrivate: false, failDelete: false, failPublish: false, deleted: new Set<string>(), failDeletePath: "", invalidatePreview: vi.fn() }));
vi.mock("@/lib/monitor-preview-store", () => ({ withMonitorPreviewInvalidation: state.invalidatePreview }));
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
      collection: (name: string) => ({ doc: (id = "new-id") => ref(`${name}/${id}`, id),
        where: () => ({ orderBy: () => ({ limit: () => ({ query: name }) }) }),
      }),
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
      runTransaction: async (run: (tx: unknown) => Promise<unknown>) => {
        if (state.failSave) throw new Error("DB failed");
        return run({
        get: async (target: { key?: string; query?: string }) => target.query
          ? { docs: [...state.docs.entries()].filter(([key, value]) => key.startsWith(`${target.query}/`) && value.status === "approved").map(([, value]) => ({ data: () => value })) }
          : { exists: state.docs.has(target.key!), get: (field: string) => state.docs.get(target.key!)?.[field], data: () => state.docs.get(target.key!) },
        update: (target: { key: string }, data: Record<string, unknown>) => state.docs.set(target.key, { ...state.docs.get(target.key), ...data }),
        set: (target: { key: string }, data: Record<string, unknown>) => state.docs.set(target.key, { ...state.docs.get(target.key), ...data }),
        });
      },
    },
    bucket: { name: "test-bucket", file: (path: string) => ({
      save: async (_buffer: unknown, options: { public: boolean; metadata: { cacheControl: string } }) => {
        state.events.push(options.public ? "upload-public" : "upload-private");
        expect(options.metadata.cacheControl).toBe("no-store");
      },
      setMetadata: async () => { if (state.deleted.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); },
      makePublic: async () => { if (state.failPublish) throw new Error("publish failed"); state.events.push("publish"); },
      makePrivate: async () => { if (state.failPrivate) throw new Error("private failed"); },
      download: async () => [Buffer.from(path)],
      getMetadata: async () => [{ contentType: "image/jpeg" }],
      delete: async () => { if (state.failDelete || path === state.failDeletePath) throw new Error("delete failed"); state.deleted.add(path); },
    }) },
  };
});
const { createSubmission, updateSubmissionStatus, deleteSubmission, withAdminImageUrls, getSubmissionImage } = await import("./submission-store");
const input = { userId: "user", templateId: "shards-a", presetId: "festival-classic-a", prizeEligible: true,
  status: "approved" as const, moderation: { safe: true, source: "cloud-vision" as const, reason: "ok" },
  collage: { buffer: Buffer.from("test"), contentType: "image/jpeg" as const, extension: "jpg" as const }, items: [],
};
beforeEach(() => {
  state.docs.clear(); state.events = []; state.deleted.clear(); state.failDeletePath = "";
  state.failSave = state.failPrivate = state.failDelete = state.failPublish = false;
  state.invalidatePreview.mockReset().mockImplementation(async (run: () => Promise<unknown>) => run());
});

describe("画像公開・非表示・削除の失敗時", () => {
  it("非表示と削除はプレビューの失効処理内で実行する", async () => {
    await createSubmission(input);
    await updateSubmissionStatus("new-id", "hide");
    expect(state.invalidatePreview).toHaveBeenCalledOnce();
    await deleteSubmission("new-id");
    expect(state.invalidatePreview).toHaveBeenCalledTimes(2);
  });
  it.each(["hide", "delete"] as const)("プレビュー公開の結果が未確定なら%sを成功させない", async (action) => {
    await createSubmission(input);
    state.invalidatePreview.mockRejectedValue(new Error("pending preview"));
    await expect(action === "hide" ? updateSubmissionStatus("new-id", "hide") : deleteSubmission("new-id")).rejects.toThrow("pending preview");
    expect(state.docs.get("submissions/new-id")?.status).toBe("approved");
  });
  it("プレビュー削除の失敗は非表示成功として返さない", async () => {
    await createSubmission(input);
    state.invalidatePreview.mockImplementation(async (run: () => Promise<unknown>) => { await run(); throw new Error("preview delete failed"); });
    await expect(updateSubmissionStatus("new-id", "hide")).rejects.toThrow("preview delete failed");
    expect(state.docs.get("submissions/new-id")?.status).toBe("hidden_manual");
  });
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
  it("承認後も画像を公開せずに保存する", async () => {
    const result = await createSubmission(input);
    expect(state.events).toEqual(["upload-private", "persist"]);
    expect(result.status).toBe("approved");
  });
  it("DB保存に失敗した画像を公開しない", async () => {
    state.failSave = true;
    await expect(createSubmission(input)).rejects.toThrow("DB failed");
    expect(state.events).toEqual(["upload-private"]);
  });
  it("非公開化に失敗したら承認せず手動確認できる記録を残す", async () => {
    state.failPrivate = true;
    await expect(createSubmission(input)).rejects.toThrow("private failed");
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

describe("認証用の画像配信", () => {
  it("手動承認でも画像を公開しない", async () => {
    await createSubmission({ ...input, status: "pending_manual" });
    const result = await updateSubmissionStatus("new-id", "approve");
    expect(result?.status).toBe("approved");
    expect(state.events).not.toContain("publish");
  });

  it.each(["approved", "pending_manual", "hidden_manual"] as const)("%sの画像も認証APIのURLだけを返す", async (status) => {
    const submission = await createSubmission({ ...input, status });
    submission.items = [{ polygonId: "one", theme: "test", imageUrl: "https://storage.googleapis.com/test-bucket/submissions/old.jpg" }];
    const [result] = await withAdminImageUrls([submission]);
    expect(result.collageImageUrl).toBe("/api/submissions/new-id/image");
    expect(result.items[0].imageUrl).toBe("/api/submissions/new-id/image?item=0");
  });

  it("外部URLをそのまま画面に返さない", async () => {
    const submission = await createSubmission(input);
    submission.collageImageUrl = "https://example.com/private.jpg";
    const [result] = await withAdminImageUrls([submission]);
    expect(result.collageImageUrl).toBeUndefined();
  });

  it("記録に紐付いた非公開画像を読み取る", async () => {
    await createSubmission(input);
    const image = await getSubmissionImage("new-id");
    expect(image?.buffer.toString()).toBe("submissions/new-id_collage.jpg");
    expect(image?.contentType).toBe("image/jpeg");
  });

  it("存在しない投稿や個別画像は返さない", async () => {
    expect(await getSubmissionImage("missing")).toBeNull();
    await createSubmission(input);
    expect(await getSubmissionImage("new-id", 0)).toBeNull();
  });

  it("別バケットや投稿以外のファイルは配信しない", async () => {
    for (const url of ["https://example.com/photo.jpg", "https://storage.googleapis.com/test-bucket/secrets/key.jpg"]) {
      state.docs.set("submissions/old", { collageImageUrl: url, items: [] });
      expect(await getSubmissionImage("old")).toBeNull();
    }
  });
});
