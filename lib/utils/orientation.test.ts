import { describe, expect, it } from "vitest";
import { getPortraitViewportStyle } from "@/lib/utils/orientation";

describe("参加者画面の縦向き表示", () => {
  it("スマホを左に倒したときは画面を逆方向に回して縦の寸法を保つ", () => {
    expect(getPortraitViewportStyle(844, 390, 90, true)).toMatchObject({
      width: 390, height: 844, transform: "translate(-50%, -50%) rotate(-90deg)",
      position: "fixed", overflowY: "auto", maxWidth: "none",
    });
  });

  it("右に倒したときも縦向きを保つ", () => {
    expect(getPortraitViewportStyle(844, 390, 270, true)?.transform)
      .toBe("translate(-50%, -50%) rotate(90deg)");
    expect(getPortraitViewportStyle(844, 390, -90, true)?.transform)
      .toBe("translate(-50%, -50%) rotate(90deg)");
  });

  it("縦画面、PC、キーボードで狭くなった縦画面は回転しない", () => {
    expect(getPortraitViewportStyle(390, 844, 0, true)).toBeUndefined();
    expect(getPortraitViewportStyle(1280, 720, 0, false)).toBeUndefined();
    expect(getPortraitViewportStyle(390, 300, 0, true)).toBeUndefined();
  });
});
