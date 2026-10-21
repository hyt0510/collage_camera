import { describe, expect, it } from "vitest";
import { getPinchZoom, getCameraSourceRect } from "@/lib/utils/camera";

describe("カメラのピンチズーム", () => {
  it("指の距離の比率で拡大し、続けて縮小できる", () => {
    expect(getPinchZoom(1, 100, 200)).toBe(2);
    expect(getPinchZoom(3, 200, 100)).toBe(1.5);
  });

  it("等倍未満や過度な拡大を防ぐ", () => {
    expect(getPinchZoom(1, 100, 10)).toBe(1);
    expect(getPinchZoom(3, 100, 1000)).toBe(4);
    expect(getPinchZoom(2, 0, 100)).toBe(2);
  });

  it("撮影時にも中央を同じ倍率で切り出す", () => {
    expect(getCameraSourceRect(1920, 1080, 2)).toEqual({
      sx: 480, sy: 270, sw: 960, sh: 540,
    });
    expect(getCameraSourceRect(1080, 1920, 1)).toEqual({
      sx: 0, sy: 0, sw: 1080, sh: 1920,
    });
  });
});
