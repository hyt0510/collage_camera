import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const get = vi.fn();
const set = vi.fn();
vi.mock("@/lib/firebase-admin", () => ({
  db: { collection: () => ({ doc: () => ({ get, set }) }) },
}));

const { CAPTURE_PRESETS } = await import("@/lib/collage-config");
const DEFAULT_ID = CAPTURE_PRESETS[0]!.id;
const OTHER_ID = CAPTURE_PRESETS[1]!.id;

// モジュール内のキャッシュをテストごとに空にするため、毎回読み込み直す
async function loadStore() {
  vi.resetModules();
  return import("./capture-preset-store");
}

describe("capture-preset-store", () => {
  beforeEach(() => {
    get.mockReset();
    set.mockReset();
  });

  it("Firestore に保存されたプリセットを返す", async () => {
    get.mockResolvedValue({ get: () => OTHER_ID });
    const store = await loadStore();
    expect((await store.getActiveCapturePreset())?.id).toBe(OTHER_ID);
  });

  it("Firestore に届かなくても既定のプリセットで動き続ける", async () => {
    get.mockRejectedValue(new Error("unavailable"));
    const store = await loadStore();
    expect((await store.getActiveCapturePreset())?.id).toBe(DEFAULT_ID);
  });

  it("保存値が存在しないプリセットなら既定のプリセットを返す", async () => {
    get.mockResolvedValue({ get: () => "deleted-preset" });
    const store = await loadStore();
    expect((await store.getActiveCapturePreset())?.id).toBe(DEFAULT_ID);
  });

  it("短時間に何度呼ばれても Firestore は1回しか読まない", async () => {
    get.mockResolvedValue({ get: () => OTHER_ID });
    const store = await loadStore();
    await store.getActiveCapturePreset();
    await store.getActiveCapturePreset();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("切り替えると保存し、すぐに新しいプリセットを返す", async () => {
    get.mockResolvedValue({ get: () => DEFAULT_ID });
    const store = await loadStore();
    await store.getActiveCapturePreset();

    expect((await store.setActiveCapturePreset(OTHER_ID))?.id).toBe(OTHER_ID);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ presetId: OTHER_ID }));
    expect((await store.getActiveCapturePreset())?.id).toBe(OTHER_ID);
  });

  it("投稿の資格判定では通信失敗を既定値に置き換えない", async () => {
    get.mockRejectedValue(new Error("unavailable"));
    const store = await loadStore();
    await expect(store.getSubmissionCapturePreset()).rejects.toThrow("unavailable");
  });

  it("初回で設定ドキュメントが未作成なら、表示と投稿で同じ既定プリセットを使う", async () => {
    get.mockResolvedValue({ exists: false, get: () => undefined });
    const store = await loadStore();
    expect((await store.getActiveCapturePreset())?.id).toBe(DEFAULT_ID);
    expect((await store.getSubmissionCapturePreset())?.id).toBe(DEFAULT_ID);
  });

  it("設定ドキュメントが存在して値だけ欠けているときは投稿を拒否する", async () => {
    get.mockResolvedValue({ exists: true, get: () => undefined });
    const store = await loadStore();
    expect(await store.getSubmissionCapturePreset()).toBeNull();
  });

  it("投稿の資格判定ではキャッシュを使わず現在の設定を読み、未知の設定は拒否する", async () => {
    get.mockResolvedValue({ get: () => OTHER_ID });
    const store = await loadStore();
    await store.getActiveCapturePreset();
    get.mockResolvedValue({ get: () => "pre-festival-home" });
    expect((await store.getSubmissionCapturePreset())?.id).toBe("pre-festival-home");
    get.mockResolvedValue({ get: () => "unknown" });
    expect(await store.getSubmissionCapturePreset()).toBeNull();
  });

  it("存在しないプリセットへの切り替えは保存せず null を返す", async () => {
    const store = await loadStore();
    expect(await store.setActiveCapturePreset("nope")).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });
});
