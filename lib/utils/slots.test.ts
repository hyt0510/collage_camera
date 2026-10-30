import { describe, expect, it } from "vitest";
import { findNextSlotId } from "./slots";

describe("findNextSlotId", () => {
  const ids = ["a", "b", "c", "d"];

  it("現在の枠の次から、撮影できる最初の枠を返す", () => {
    expect(findNextSlotId(ids, "a", (id) => id !== "b")).toBe("c");
  });

  it("末尾まで見つからなければ先頭に戻って探す", () => {
    expect(findNextSlotId(ids, "c", (id) => id === "a")).toBe("a");
  });

  it("現在の枠は撮影できる扱いでも返さない", () => {
    expect(findNextSlotId(ids, "b", (id) => id === "b")).toBeNull();
  });

  it("撮影できる枠がなければ null を返す", () => {
    expect(findNextSlotId(ids, "a", () => false)).toBeNull();
  });

  it("現在の枠がない場合は先頭から探す", () => {
    expect(findNextSlotId(ids, null, (id) => id !== "a")).toBe("b");
  });
});
