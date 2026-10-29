// 本番準備の切り替えは、日本時間2026年10月30日午前0時から適用する。
export const FESTIVAL_LAUNCH_AT = Date.parse("2026-10-30T00:00:00+09:00");
export const FESTIVAL_PRESET_ID = "festival-shards-6-v3";

export const CAPTURE_STORAGE_KEYS = {
  images: "collage_v10_img",
  preset: "collage_v10_preset",
  request: "collage_v10_request",
  unlockedQrs: "collage_v10_unlocked_qrs",
} as const;
const RESET_MARKER_KEY = "collage_festival_2026_capture_reset";

type CaptureStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 初回だけ撮影途中と解除状態を消し、履歴・ログイン・投稿回数は残す。 */
export function resetCaptureForFestival(storage: CaptureStorage, now = Date.now()): boolean {
  if (now < FESTIVAL_LAUNCH_AT || storage.getItem(RESET_MARKER_KEY) === "1") return false;
  for (const key of Object.values(CAPTURE_STORAGE_KEYS)) storage.removeItem(key);
  storage.setItem(RESET_MARKER_KEY, "1");
  return true;
}

/** 以前の設定は本番用に切り替え、その後の管理者による選択を尊重する。 */
export function getLaunchPresetId(presetId: string, updatedAt: unknown, now = Date.now()): string {
  if (now < FESTIVAL_LAUNCH_AT) return presetId;
  const updated = typeof updatedAt === "string" ? Date.parse(updatedAt) : NaN;
  return updated >= FESTIVAL_LAUNCH_AT ? presetId : FESTIVAL_PRESET_ID;
}
