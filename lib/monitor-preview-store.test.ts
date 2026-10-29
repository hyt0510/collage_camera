import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn(), approved: vi.fn(), reserve: vi.fn(), complete: vi.fn(), idle: vi.fn(), firebase: vi.fn(), lockKeys: [] as string[] }));
vi.mock("@vercel/blob", () => ({ get: state.get, put: state.put, del: state.del }));
vi.mock("@/lib/submission-store", () => ({ listApprovedSubmissions: state.approved }));
vi.mock("@/lib/firebase-admin", () => ({ db: { collection: state.firebase }, bucket: { file: state.firebase } }));
vi.mock("@/lib/operation-lock", () => ({ withOperationLock: async (key: string, run: () => Promise<unknown>) => { state.lockKeys.push(key); return run(); } }));
vi.mock("@/lib/monitor-preview-budget", () => ({
  MONITOR_PREVIEW_MAX_AGE_MS: 90_000, reserveMonitorPreviewPublication: state.reserve,
  completeMonitorPreviewPublication: state.complete, assertMonitorPreviewIdle: state.idle,
}));
const { getMonitorPreview, saveMonitorPreview, withMonitorPreviewInvalidation, deleteMonitorPreview } = await import("./monitor-preview-store");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const etag = `"${createHash("sha256").update(jpeg).digest("hex")}"`;
const now = Date.parse("2026-10-31T10:00:00+09:00");
const atlas = {columns:1,rows:1,placements:[{row:13,col:5}]};
const atlasEtag = `"${createHash("sha256").update(jpeg).update(JSON.stringify(atlas)).digest("hex")}"`;
const envelope = (changes: Record<string, unknown> = {}) => ({ version: 1, updatedAt: now, imageDataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, etag, ...changes });
const blobResponse = (body: unknown = envelope()) => ({ stream: new Response(JSON.stringify(body)).body });
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("MONITOR_BLOB_READ_WRITE_TOKEN", "private-test-token");
  state.lockKeys = []; state.approved.mockResolvedValue([{ id: "approved" }]); state.reserve.mockResolvedValue("reservation");
  state.get.mockResolvedValue(blobResponse()); state.put.mockResolvedValue({}); state.del.mockResolvedValue(undefined);
  state.firebase.mockImplementation(() => { throw new Error("Firebase must not be called"); });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("非公開Blobのモニタープレビュー", () => {
  it("V2は画像と配置情報を保存し、GETでもFirebaseを読まない", async () => {
    state.approved.mockResolvedValue([{id:"approved",placement:atlas.placements[0]}]);
    expect(await saveMonitorPreview(jpeg,["approved"],atlas)).toBe(true);
    const saved=JSON.parse(state.put.mock.calls[0][1]);
    expect(saved).toMatchObject({version:2,atlas,etag:atlasEtag});
    expect(JSON.stringify(saved)).not.toContain("approved");
    state.approved.mockClear(); state.get.mockResolvedValue(blobResponse(saved));
    expect(await getMonitorPreview()).toEqual({buffer:jpeg,updatedAt:now,etag:atlasEtag,atlas});
    expect(state.approved).not.toHaveBeenCalled(); expect(state.firebase).not.toHaveBeenCalled();
  });
  it("画像が同じでも配置が違えばETagを変える", async () => {
    const next={...atlas,placements:[{row:13,col:6}]};
    state.approved.mockResolvedValue([{id:"approved",placement:atlas.placements[0]}]);
    await saveMonitorPreview(jpeg,["approved"],atlas);
    const first=JSON.parse(state.put.mock.calls[0][1]).etag;
    state.approved.mockResolvedValue([{id:"approved",placement:next.placements[0]}]);
    await saveMonitorPreview(jpeg,["approved"],next);
    expect(JSON.parse(state.put.mock.calls[1][1]).etag).not.toBe(first);
  });
  it("V2の配置と投稿が一致しない画像を保存しない", async () => {
    state.approved.mockResolvedValue([{id:"approved",placement:{row:13,col:6}}]);
    expect(await saveMonitorPreview(jpeg,["approved"],atlas)).toBe(false);
    expect(state.put).not.toHaveBeenCalled();
  });
  it("不正なV2メタデータはGETで拒否する", async () => {
    state.get.mockResolvedValue(blobResponse(envelope({version:2,atlas:{...atlas,placements:[{row:0,col:0}]},etag:atlasEtag})));
    expect(await getMonitorPreview()).toBeNull();
  });
  it("一括削除が使う既存のプレビュー削除APIを維持する", async () => {
    await deleteMonitorPreview();
    expect(state.del).toHaveBeenCalledOnce();
    expect(state.idle).toHaveBeenCalledOnce();
  });
  it("参加者の取得はBlobだけを読み、Firebaseや承認一覧を確認しない", async () => {
    expect(await getMonitorPreview()).toEqual({ buffer: jpeg, updatedAt: now, etag });
    expect(state.get).toHaveBeenCalledWith("monitor/preview.json", expect.objectContaining({ access: "private", useCache: false, token: "private-test-token" }));
    expect(state.firebase).not.toHaveBeenCalled(); expect(state.approved).not.toHaveBeenCalled(); expect(state.reserve).not.toHaveBeenCalled();
  });
  it("運営の保存だけが現在の承認一覧と永続予約を確認する", async () => {
    expect(await saveMonitorPreview(jpeg, ["approved"])).toBe(true);
    expect(state.approved).toHaveBeenCalledOnce(); expect(state.reserve).toHaveBeenCalledWith(now);
    expect(state.lockKeys).toEqual(["monitor-preview-publish"]);
    expect(JSON.parse(state.put.mock.calls[0][1])).toEqual(envelope());
    expect(state.put.mock.calls[0][2]).toMatchObject({ access: "private", allowOverwrite: true, addRandomSuffix: false });
    expect(state.complete).toHaveBeenCalledWith("reservation");
  });
  it("未承認作品を含む画像は予約もアップロードもしない", async () => {
    expect(await saveMonitorPreview(jpeg, ["hidden"])).toBe(false);
    expect(state.reserve).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
  });
  it("失敗したputの保留は解除せず、Firebase配信へ戻さない", async () => {
    state.put.mockRejectedValue(new Error("timeout"));
    await expect(saveMonitorPreview(jpeg, ["approved"])).rejects.toThrow("timeout");
    expect(state.complete).not.toHaveBeenCalled();
  });
  it("予約上限を超えたらBlobへ書かない", async () => {
    state.reserve.mockRejectedValue(new Error("limit"));
    await expect(saveMonitorPreview(jpeg, ["approved"])).rejects.toThrow("limit");
    expect(state.put).not.toHaveBeenCalled();
  });
  it("遅れて完了した書き込みの時刻を付け直さない", async () => {
    state.put.mockImplementation(async () => { vi.setSystemTime(now + 300_000); });
    await saveMonitorPreview(jpeg, ["approved"]);
    const saved = JSON.parse(state.put.mock.calls[0][1]);
    expect(saved.updatedAt).toBe(now);
    state.get.mockResolvedValue(blobResponse(saved));
    expect(await getMonitorPreview()).toBeNull();
  });
  it("承認確認で90秒経過した画像を公開しない", async () => {
    state.approved.mockImplementation(async () => { vi.setSystemTime(now + 90_000); return [{ id: "approved" }]; });
    expect(await saveMonitorPreview(jpeg, ["approved"])).toBe(false);
    expect(state.put).not.toHaveBeenCalled();
  });
  it.each([{ updatedAt: now - 90_000 }, { updatedAt: now + 1 }, { version: 2 }, { etag: '"wrong"' }, { imageDataUrl: "data:image/jpeg;base64,PHN2Zz4=" }])("期限切れ・不正な内容は配信しない：%s", async (changes) => {
    state.get.mockResolvedValue(blobResponse(envelope(changes)));
    expect(await getMonitorPreview()).toBeNull();
  });
  it("300KBを超えるJSONや壊れたJSONを配信しない", async () => {
    for (const text of ["x".repeat(300_001), "{bad"]) {
      state.get.mockResolvedValue({ stream: new Response(text).body });
      expect(await getMonitorPreview()).toBeNull();
    }
  });
  it("未生成とBlob障害を区別し、どちらもFirebaseに接続しない", async () => {
    state.get.mockResolvedValue(null); expect(await getMonitorPreview()).toBeNull();
    state.get.mockRejectedValue(new Error("suspended"));
    await expect(getMonitorPreview()).rejects.toThrow("suspended"); expect(state.firebase).not.toHaveBeenCalled();
  });
  it("専用トークンがないと別のストアへ接続しない", async () => {
    vi.stubEnv("MONITOR_BLOB_READ_WRITE_TOKEN", "");
    await expect(getMonitorPreview()).rejects.toThrow(); expect(state.get).not.toHaveBeenCalled();
  });
  it("公開終了後はBlobもFirebaseも読み書きしない", async () => {
    vi.setSystemTime(new Date("2026-11-01T23:59:00+09:00"));
    expect(await getMonitorPreview()).toBeNull(); expect(await saveMonitorPreview(jpeg, ["approved"])).toBe(false);
    expect(state.get).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled(); expect(state.approved).not.toHaveBeenCalled();
  });
  it("非表示処理は保留を確認して共有ロック内で削除する", async () => {
    const operation = vi.fn(async () => "hidden");
    expect(await withMonitorPreviewInvalidation(operation)).toBe("hidden");
    expect(state.idle).toHaveBeenCalledOnce(); expect(operation).toHaveBeenCalledOnce();
    expect(state.del).toHaveBeenCalledWith("monitor/preview.json", expect.objectContaining({ token: "private-test-token" }));
    expect(state.lockKeys).toEqual(["monitor-preview-publish"]);
  });
  it("成否不明のputがある間は非表示状態に変更しない", async () => {
    state.idle.mockRejectedValue(new Error("pending")); const operation = vi.fn();
    await expect(withMonitorPreviewInvalidation(operation)).rejects.toThrow("pending");
    expect(operation).not.toHaveBeenCalled(); expect(state.del).not.toHaveBeenCalled();
  });
  it("Blob削除失敗を非表示成功と扱わない", async () => {
    state.del.mockRejectedValue(new Error("delete failed"));
    await expect(withMonitorPreviewInvalidation(async () => true)).rejects.toThrow("delete failed");
  });
});
