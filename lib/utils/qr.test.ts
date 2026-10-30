import { describe, expect, it } from "vitest";
import { parseUnlockCode } from "./qr";

describe("parseUnlockCode", () => {
  it("URL の unlock パラメータの値を返す", () => {
    expect(parseUnlockCode("https://example.com/?unlock=a_1")).toBe("a_1");
  });

  it("ほかのパラメータがあっても unlock の値を返す", () => {
    expect(parseUnlockCode("https://example.com/?from=qr&unlock=4_1")).toBe("4_1");
  });

  it("unlock パラメータがない URL なら null を返す", () => {
    expect(parseUnlockCode("https://example.com/")).toBeNull();
  });

  it("unlock の値が空なら null を返す", () => {
    expect(parseUnlockCode("https://example.com/?unlock=")).toBeNull();
  });

  it("URL でない文字列なら null を返す", () => {
    expect(parseUnlockCode("こんにちは")).toBeNull();
  });
});
