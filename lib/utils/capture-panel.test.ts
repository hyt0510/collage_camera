import { describe, expect, it } from "vitest";
import { getCapturePanelMode } from "./capture-panel";

describe("getCapturePanelMode", () => {
  it("枠を選んでいなければ、選び方の案内を出す", () => {
    expect(getCapturePanelMode({ hasSelection: false, isLocked: false, allFilled: false })).toBe("hint");
  });

  it("枠を選んでいなくても、全部撮り終えていれば投稿ボタンを出す", () => {
    expect(getCapturePanelMode({ hasSelection: false, isLocked: false, allFilled: true })).toBe("submit");
  });

  it("ロックされていない枠を選んでいれば、撮影ボタンを出す", () => {
    expect(getCapturePanelMode({ hasSelection: true, isLocked: false, allFilled: false })).toBe("capture");
  });

  it("ロックされた枠を選んでいれば、解除方法を出す", () => {
    expect(getCapturePanelMode({ hasSelection: true, isLocked: true, allFilled: false })).toBe("locked");
  });

  it("全部撮り終えて枠を選んでいれば、撮り直しと投稿の両方を出す", () => {
    expect(getCapturePanelMode({ hasSelection: true, isLocked: false, allFilled: true })).toBe("retakeOrSubmit");
  });
});
