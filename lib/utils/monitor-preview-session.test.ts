import { describe, expect, it } from "vitest";
import { getMonitorPreviewSessionDeadline, isMonitorPreviewSessionExpired } from "./monitor-preview-session";

describe("スマホの自動更新期限", () => {
  it("開始から180秒を期限にする", () => {
    expect(getMonitorPreviewSessionDeadline(1_000)).toBe(181_000);
  });
  it("期限直前は継続し、一致・超過で停止する", () => {
    expect(isMonitorPreviewSessionExpired(181_000, 180_999)).toBe(false);
    expect(isMonitorPreviewSessionExpired(181_000, 181_000)).toBe(true);
    expect(isMonitorPreviewSessionExpired(181_000, 600_000)).toBe(true);
  });
  it("手動再開時にだけ新しい開始時刻から期限を作る", () => {
    const first = getMonitorPreviewSessionDeadline(1_000);
    expect(isMonitorPreviewSessionExpired(first, 600_000)).toBe(true);
    expect(isMonitorPreviewSessionExpired(getMonitorPreviewSessionDeadline(600_000), 600_000)).toBe(false);
  });
});
