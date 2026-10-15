/**
 * 景品交換（本部テントのガチャ）に関するユーティリティ
 */

// 交換してから「景品交換OK」の画面を出せる時間
export const PRIZE_TICKET_DURATION_MS = 10 * 60 * 1000;

/**
 * 本部テントの QR コード（`?prize=...` 付きの URL）から合言葉を取り出す。
 * URL でない、または prize パラメータがなければ null。
 */
export function parsePrizeCode(text: string): string | null {
  try {
    return new URL(text).searchParams.get("prize") || null;
  } catch {
    return null;
  }
}

/**
 * 「景品交換OK」の画面を出せる残り時間（ミリ秒）。
 * スマホの時計のずれに左右されないよう、サーバーの時刻で計算する
 */
export function getTicketRemainingMs(redeemedAt: string, now: number): number {
  const at = Date.parse(redeemedAt);
  if (Number.isNaN(at)) return 0;
  const elapsed = Math.max(0, now - at);
  return Math.max(0, PRIZE_TICKET_DURATION_MS - elapsed);
}

/** 残り時間を「m:ss」で表す */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
