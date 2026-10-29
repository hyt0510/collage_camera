// 日本時間の2026年11月1日23時59分ちょうどから、モニターの公開を停止する。
export const MONITOR_CLOSES_AT = Date.parse("2026-11-01T23:59:00+09:00");

export function isMonitorClosed(now = Date.now()): boolean {
  return now >= MONITOR_CLOSES_AT;
}
