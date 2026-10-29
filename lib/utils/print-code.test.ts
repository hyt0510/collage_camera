import { describe, expect, it } from "vitest";
import { formatPrintCode, normalizePrintCode } from "@/lib/utils/print-code";

describe("印刷受付番号", () => {
  it("小文字・ハイフン・空白を含む手入力を同じ番号として扱う", () => {
    expect(normalizePrintCode(" k7m-4px ")).toBe("K7M4PX");
    expect(normalizePrintCode("k7m 4px")).toBe("K7M4PX");
  });
  it.each(["K7M4P", "K7M4PXX", "O1I0AB", "K7M.4PX", "作品ID", "a".repeat(64)])("受付番号ではない入力は判別する（%s）", (input) => {
    expect(normalizePrintCode(input)).toBeNull();
  });
  it("画面では3文字ずつに区切る", () => {
    expect(formatPrintCode("K7M4PX")).toBe("K7M-4PX");
  });
});
