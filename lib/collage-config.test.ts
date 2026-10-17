import { describe, expect, it } from "vitest";
import { isPrizeEligiblePreset } from "./collage-config";

describe("isPrizeEligiblePreset", () => {
  it("当日用のプリセットなら対象にする", () => {
    expect(isPrizeEligiblePreset("festival-shards-6-v3")).toBe(true);
  });

  it("事前公開用のプリセットなら対象外にする", () => {
    expect(isPrizeEligiblePreset("pre-festival-home")).toBe(false);
  });

  it("presetId のない古い投稿は対象にする", () => {
    expect(isPrizeEligiblePreset(undefined)).toBe(true);
  });

  it("設定にないプリセットは対象にする", () => {
    expect(isPrizeEligiblePreset("removed-preset")).toBe(true);
  });
});
