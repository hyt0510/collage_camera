// 本番準備の切り替えは、日本時間2026年10月30日午前0時から適用する。
export const FESTIVAL_LAUNCH_AT = Date.parse("2026-10-30T00:00:00+09:00");
export const FESTIVAL_PRESET_ID = "festival-shards-6-v3";

export const CAPTURE_STORAGE_KEYS = {
  images: "collage_v10_img",
  preset: "collage_v10_preset",
  request: "collage_v10_request",
  unlockedQrs: "collage_v10_unlocked_qrs",
} as const;
const FESTIVAL_SECOND_DAY_AT = Date.parse("2026-10-31T00:00:00+09:00");
const CAPTURE_RESETS = [
  { at: FESTIVAL_LAUNCH_AT, key: "collage_festival_2026_capture_reset" },
  { at: FESTIVAL_SECOND_DAY_AT, key: "collage_festival_2026_capture_reset_oct31" },
] as const;

/** 現在適用するプリセットの切り替え境界を返す。 */
export function getFestivalSwitchAt(now = Date.now()): number {
  return now >= FESTIVAL_SECOND_DAY_AT ? FESTIVAL_SECOND_DAY_AT : FESTIVAL_LAUNCH_AT;
}

type CaptureStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 各切り替え日につき一度だけ撮影途中と解除状態を消し、履歴・ログイン・投稿回数は残す。 */
export function resetCaptureForFestival(storage: CaptureStorage, now = Date.now()): boolean {
  const pending = CAPTURE_RESETS.filter(({ at, key }) => now >= at && storage.getItem(key) !== "1");
  if (pending.length === 0) return false;
  for (const key of Object.values(CAPTURE_STORAGE_KEYS)) storage.removeItem(key);
  for (const { key } of pending) storage.setItem(key, "1");
  return true;
}

/** 状態を復元した後に、別タブも含めて各日のリセットが発生したかを一度だけ確認する。 */
export function createFestivalResetCheck(storage: CaptureStorage) {
  const applied = new Set(CAPTURE_RESETS.filter(({ key }) => storage.getItem(key) === "1").map(({ key }) => key));
  return (now = Date.now()): boolean => {
    const reset = resetCaptureForFestival(storage, now);
    let appliedElsewhere = false;
    for (const { key } of CAPTURE_RESETS) {
      if (!applied.has(key) && storage.getItem(key) === "1") {
        applied.add(key);
        appliedElsewhere = true;
      }
    }
    return reset || appliedElsewhere;
  };
}
/** 以前の設定は本番用に切り替え、その後の管理者による選択を尊重する。 */
export function getLaunchPresetId(presetId: string, updatedAt: unknown, now = Date.now()): string {
  const switchAt = getFestivalSwitchAt(now);
  if (now < switchAt) return presetId;
  const updated = typeof updatedAt === "string" ? Date.parse(updatedAt) : NaN;
  return updated >= switchAt ? presetId : FESTIVAL_PRESET_ID;
}
