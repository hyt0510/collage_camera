/**
 * 作成タブの下部パネルに何を出すかを決めるユーティリティ
 */

export type CapturePanelMode = "hint" | "capture" | "locked" | "submit" | "retakeOrSubmit";

export function getCapturePanelMode({ hasSelection, isLocked, allFilled }: {
  hasSelection: boolean;
  isLocked: boolean;
  allFilled: boolean;
}): CapturePanelMode {
  if (!hasSelection) return allFilled ? "submit" : "hint";
  if (isLocked) return "locked";
  return allFilled ? "retakeOrSubmit" : "capture";
}
