import { describe, expect, it } from "vitest";
import { CAPTURE_STORAGE_KEYS, FESTIVAL_LAUNCH_AT, FESTIVAL_PRESET_ID, createFestivalResetCheck, getLaunchPresetId, resetCaptureForFestival } from "./festival-launch";

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
    expect(resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT + 1)).toBe(false);
    expect(storage.data).toEqual(before);
  });
});

describe("タブごとの本番切り替え確認", () => {
  it("別タブでリセットされたら、新しい写真を消さずに旧状態の再読み込みを要求する", () => {
    const storage = createStorage();
    const check = createFestivalResetCheck(storage);
    expect(check(FESTIVAL_LAUNCH_AT - 1)).toBe(false);
    resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT);
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "new-photo");
    storage.setItem(CAPTURE_STORAGE_KEYS.unlockedQrs, "new-unlock");
    expect(check(FESTIVAL_LAUNCH_AT + 1)).toBe(true);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBe("new-photo");
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.unlockedQrs)).toBe("new-unlock");
    expect(check(FESTIVAL_LAUNCH_AT + 2)).toBe(false);
  });

  it("本番切り替え後に開いたタブは再読み込みせず、撮った写真を保持する", () => {
    const storage = createStorage();
    resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT);
    const check = createFestivalResetCheck(storage);
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "new-photo");
    expect(check(FESTIVAL_LAUNCH_AT + 1)).toBe(false);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBe("new-photo");
  });

  it("自分のタブで切り替えた場合も一度だけ再読み込みを要求する", () => {
    const storage = createStorage();
    const check = createFestivalResetCheck(storage);
    expect(check(FESTIVAL_LAUNCH_AT)).toBe(true);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBeNull();
    expect(check(FESTIVAL_LAUNCH_AT + 1)).toBe(false);
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

describe("10月31日の撮影状態リセット", () => {
  const nextDay = Date.parse("2026-10-31T00:00:00+09:00");

  it("30日に初期化済みでも31日午前0時にもう一度だけ初期化し、履歴・ログイン・回数を残す", () => {
    const storage = createStorage();
    resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT);
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "oct30-photo");
    expect(resetCaptureForFestival(storage, nextDay - 1)).toBe(false);
    expect(resetCaptureForFestival(storage, nextDay)).toBe(true);
    for (const key of Object.values(CAPTURE_STORAGE_KEYS)) expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem("collage_v10_history")).toBe("saved-history");
    expect(storage.getItem("collage_v10_count")).toBe("2");
    expect(storage.getItem("firebase:authUser:test")).toBe("signed-in-user");
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "oct31-photo");
    expect(resetCaptureForFestival(storage, nextDay + 86_400_000)).toBe(false);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBe("oct31-photo");
  });

  it("31日に初めて開いた端末はまとめて初期化し、再度消さない", () => {
    const storage = createStorage();
    expect(resetCaptureForFestival(storage, nextDay)).toBe(true);
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "oct31-photo");
    expect(resetCaptureForFestival(storage, nextDay + 1)).toBe(false);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBe("oct31-photo");
  });

  it("30日に開いたタブも31日の切り替えを一度だけ検出する", () => {
    const storage = createStorage();
    resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT);
    const check = createFestivalResetCheck(storage);
    expect(check(nextDay - 1)).toBe(false);
    expect(check(nextDay)).toBe(true);
    expect(check(nextDay + 1)).toBe(false);
  });

  it("別タブの31日リセットを検出しても、その後の写真を消さない", () => {
    const storage = createStorage();
    resetCaptureForFestival(storage, FESTIVAL_LAUNCH_AT);
    const check = createFestivalResetCheck(storage);
    resetCaptureForFestival(storage, nextDay);
    storage.setItem(CAPTURE_STORAGE_KEYS.images, "oct31-photo");
    expect(check(nextDay + 1)).toBe(true);
    expect(check(nextDay + 2)).toBe(false);
    expect(storage.getItem(CAPTURE_STORAGE_KEYS.images)).toBe("oct31-photo");
    const reopened = createFestivalResetCheck(storage);
    expect(reopened(nextDay + 3)).toBe(false);
  });
});
describe("10月31日のプリセット切り替え", () => {
  const restart = Date.parse("2026-10-31T00:00:00+09:00");

  it("直前までは30日に運営が選んだプリセットを維持する", () => {
    expect(getLaunchPresetId("festival-quad-4-v2", "2026-10-30T12:00:00+09:00", restart - 1)).toBe("festival-quad-4-v2");
  });

  it.each([undefined, "invalid", "2026-10-29T12:00:00+09:00", "2026-10-30T23:59:59+09:00"])("31日午前0時には旧設定（%s）を6分割V3へ切り替える", updatedAt => {
    expect(getLaunchPresetId("festival-quad-4-v2", updatedAt, restart)).toBe(FESTIVAL_PRESET_ID);
  });

  it.each(["2026-10-31T00:00:00+09:00", "2026-10-31T10:00:00+09:00"])("31日の切り替え後の運営設定（%s）は翌日も保持する", updatedAt => {
    expect(getLaunchPresetId("festival-quad-4-v2", updatedAt, restart + 86_400_000)).toBe("festival-quad-4-v2");
  });
});
