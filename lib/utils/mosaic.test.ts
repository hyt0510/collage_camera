import { describe, expect, it } from "vitest";
import { generateCollageMosaicPlacements, GRID_COLS, GRID_ROWS } from "./mosaic";

describe("generateCollageMosaicPlacements", () => {
  const placements = generateCollageMosaicPlacements();

  it("COLLAGE の文字を構成する 278 枠を返す", () => {
    expect(placements).toHaveLength(278);
  });

  it("同じマスを重複して使わない", () => {
    const keys = new Set(placements.map((p) => `${p.row}-${p.col}`));
    expect(keys.size).toBe(placements.length);
  });

  it("すべての枠がグリッドの範囲内に収まる", () => {
    for (const p of placements) {
      expect(p.row).toBeGreaterThanOrEqual(0);
      expect(p.row).toBeLessThan(GRID_ROWS);
      expect(p.col).toBeGreaterThanOrEqual(0);
      expect(p.col).toBeLessThan(GRID_COLS);
    }
  });
});
