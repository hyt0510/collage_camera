import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00+09:00"));
    get.mockReset();
    set.mockReset();
  });

  afterEach(() => vi.useRealTimers());

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

  it("切り替え時刻をまたいだら短時間キャッシュを使わず6分割を返す", async () => {
    vi.setSystemTime(new Date("2026-10-29T23:59:59+09:00"));
    get.mockResolvedValue({ get: (field: string) => field === "presetId" ? "pre-festival-home" : "2026-10-29T10:00:00+09:00" });
    const store = await loadStore();
    expect((await store.getActiveCapturePreset())?.id).toBe("pre-festival-home");
    vi.setSystemTime(new Date("2026-10-30T00:00:00+09:00"));
    const preset = await store.getActiveCapturePreset();
    expect(preset?.id).toBe("festival-shards-6-v3");
    expect(preset?.polygons).toHaveLength(6);
    expect((await store.getSubmissionCapturePreset())?.id).toBe(preset?.id);
    expect(get).toHaveBeenCalledTimes(3);
    expect(set).not.toHaveBeenCalled();
  });

  it("切り替え後の未設定環境でも表示と投稿を6分割でそろえる", async () => {
    vi.setSystemTime(new Date("2026-10-30T00:00:00+09:00"));
    get.mockResolvedValue({ exists: false, get: () => undefined });
    const store = await loadStore();
    expect((await store.getActiveCapturePreset())?.id).toBe("festival-shards-6-v3");
    expect((await store.getSubmissionCapturePreset())?.id).toBe("festival-shards-6-v3");
  });

  it("切り替え後の管理者による変更はキャッシュ期限後も保持する", async () => {
    vi.setSystemTime(new Date("2026-10-30T00:01:00+09:00"));
    const store = await loadStore();
    expect((await store.setActiveCapturePreset(OTHER_ID))?.id).toBe(OTHER_ID);
    get.mockResolvedValue({ get: (field: string) => field === "presetId" ? OTHER_ID : "2026-10-30T00:01:00+09:00" });
    vi.advanceTimersByTime(11_000);
    expect((await store.getActiveCapturePreset())?.id).toBe(OTHER_ID);
    expect((await store.getSubmissionCapturePreset())?.id).toBe(OTHER_ID);
  });

  it("切り替え直後の読み取り障害で事前公開のお題を再利用しない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.setSystemTime(new Date("2026-10-29T23:59:59+09:00"));
      get.mockResolvedValue({ get: () => "pre-festival-home" });
      const store = await loadStore();
      await store.getActiveCapturePreset();
      vi.setSystemTime(new Date("2026-10-30T00:00:00+09:00"));
      get.mockRejectedValue(new Error("offline"));
      expect((await store.getActiveCapturePreset())?.id).toBe("festival-shards-6-v3");
      await expect(store.getSubmissionCapturePreset()).rejects.toThrow("offline");
    } finally { log.mockRestore(); }
  });

  it("境界前に開始した読み取りが境界後に失敗しても6分割へ切り替える", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.setSystemTime(new Date("2026-10-29T23:59:48+09:00"));
      get.mockResolvedValue({ get: () => "pre-festival-home" });
      const store = await loadStore();
      await store.getActiveCapturePreset();
      vi.setSystemTime(new Date("2026-10-29T23:59:59+09:00"));
      get.mockImplementationOnce(async () => {
        vi.setSystemTime(new Date("2026-10-30T00:00:01+09:00"));
        throw new Error("offline");
      });
      expect((await store.getActiveCapturePreset())?.id).toBe("festival-shards-6-v3");
      expect((await store.getActiveCapturePreset())?.id).toBe("festival-shards-6-v3");
    } finally { log.mockRestore(); }
  });});
