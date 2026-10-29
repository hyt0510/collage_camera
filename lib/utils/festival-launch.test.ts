import { describe, expect, it } from "vitest";
import { CAPTURE_STORAGE_KEYS, FESTIVAL_LAUNCH_AT, FESTIVAL_PRESET_ID, getLaunchPresetId, resetCaptureForFestival } from "./festival-launch";

function createStorage() {
  const data = new Map<string, string>([
    ["collage_v10_img", "old-photo"], ["collage_v10_preset", "old-preset"],
    ["collage_v10_unlocked_qrs", "old-unlocks"], ["collage_v10_request", "old-request"],
    ["collage_v10_history", "saved-history"], ["collage_v10_count", "2"],
    ["firebase:authUser:test", "signed-in-user"],
  ]);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe("本番切り替え時の撮影状態リセット", () => {
  it("切り替え日時は日本時間10月30日午前0時", () => {
    expect(new Date(FESTIVAL_LAUNCH_AT).toISOString()).toBe("2026-10-29T15:00:00.000Z");
  });

  it("切り替え直前までは保存状態を一切変更しない", () => {
    const storage = createStorage();
    const before = new Map(storage.data);
    expect(resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT - 1)).toBe(false);
    expect(storage.data).toEqual(before);
  });

  it("切り替え時刻以降は撮影途中・割り当て・解除・再送キーだけを消す", () => {
    const storage = createStorage();
    expect(resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT)).toBe(true);
    for (const key of Object.values(CAPTURE_STORAGE_KEYS)) expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem("collage_v10_history")).toBe("saved-history");
    expect(storage.getItem("collage_v10_count")).toBe("2");
    expect(storage.getItem("firebase:authUser:test")).toBe("signed-in-user");
  });

  it("翌日初めて開いた端末もリセットする", () => {
    const storage = createStorage();
    expect(resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT + 86_400_000)).toBe(true);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBeNull();
  });

  it("二度目以降は本番で撮った写真と解除状態を消さない", () => {
    const storage = createStorage();
    resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT);
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "new-photo");
    storage.setItem(CAPTURE_STORAGE_KEYS.unlockedQrs, "new-unlock");
    storage.setItem(CAPTURE_STORAGE_KEYS.preset, "new-preset");
    storage.setItem(CAPTURE_STORAGE_KEYS.request, "new-request");
    const before = new Map(storage.data);
    expect(resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT + 86_400_000)).toBe(false);
    expect(storage.data).toEqual(before);
  });
});

describe("本番のプリセット選択", () => {
  it("切り替え直前までは管理者の設定を維持する", () => {
    expect(getLaunchPresetId("pre-festival-home", undefined, FESTIVAL_LAUNCH_AT - 1)).toBe("pre-festival-home");
  });

  it("切り替え時刻には以前の設定を6分割V3へ変更する", () => {
    expect(FESTIVAL_PRESET_ID).toBe("festival-shards-6-v3");
    expect(getLaunchPresetId("pre-festival-home", "2026-10-29T23:59:59+09:00", FESTIVAL_LAUNCH_AT)).toBe(FESTIVAL_PRESET_ID);
    expect(getLaunchPresetId("festival-classic-a", undefined, FESTIVAL_LAUNCH_AT)).toBe(FESTIVAL_PRESET_ID);
  });

  it("切り替え後に管理者が保存した設定は上書きしない", () => {
    expect(getLaunchPresetId("festival-quad-4-v2", "2026-10-30T00:00:00+09:00", FESTIVAL_LAUNCH_AT + 1)).toBe("festival-quad-4-v2");
  });
});
