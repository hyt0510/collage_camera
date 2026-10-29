import { describe, expect, it } from "vitest";
import { isMonitorClosed, MONITOR_CLOSES_AT } from "./monitor-schedule";

describe("モニターの公開期限", () => {
  it("2026年11月1日23時59分の日本時間をUTCに変換する", () => {
    expect(new Date(MONITOR_CLOSES_AT).toISOString()).toBe("2026-11-01T14:59:00.000Z");
  });
  it("期限の1ミリ秒前までは公開し、期限ちょうどから停止する", () => {
    expect(isMonitorClosed(MONITOR_CLOSES_AT - 1)).toBe(false);
    expect(isMonitorClosed(MONITOR_CLOSES_AT)).toBe(true);
    expect(isMonitorClosed(MONITOR_CLOSES_AT + 1)).toBe(true);
  });
});
