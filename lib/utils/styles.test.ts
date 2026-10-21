import { describe, expect, it } from "vitest";
import {
  getPolygonBoundingBox,
  getPolygonCenter,
  getCenteredPolygon,
  hexToRgba,
  toSvgPolygonPoints,
} from "./styles";

describe("getCenteredPolygon", () => {
  it("左上の枠を形と大きさを保って中央に移す", () => {
    expect(getCenteredPolygon("polygon(0% 0%, 40% 0%, 20% 30%)")).toEqual({
      clipPath: "polygon(30% 35%, 70% 35%, 50% 65%)",
      offsetX: 30,
      offsetY: 35,
    });
  });

  it("右下の枠は左上へ移す", () => {
    expect(getCenteredPolygon("polygon(60% 70%, 100% 70%, 100% 100%, 60% 100%)")).toEqual({
      clipPath: "polygon(30% 35%, 70% 35%, 70% 65%, 30% 65%)",
      offsetX: -30,
      offsetY: -35,
    });
  });

  it("全面の枠と枠なしでは位置補正をしない", () => {
    const clipPath = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
    expect(getCenteredPolygon(clipPath)).toEqual({ clipPath, offsetX: 0, offsetY: 0 });
    expect(getCenteredPolygon("")).toEqual({ clipPath: "", offsetX: 0, offsetY: 0 });
  });
});

describe("hexToRgba", () => {
  it("6桁の16進カラーを rgba に変換する", () => {
    expect(hexToRgba("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
  });

  it("3桁の省略形も展開して変換する", () => {
    expect(hexToRgba("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });
});

describe("toSvgPolygonPoints", () => {
  it("CSS の polygon() を SVG の points 形式に変換する", () => {
    expect(toSvgPolygonPoints("polygon(0% 0%, 100% 0%, 50% 100%)")).toBe(
      "0,0 100,0 50,100",
    );
  });
});

describe("getPolygonCenter", () => {
  it("頂点の平均座標を返す", () => {
    expect(getPolygonCenter("polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)")).toEqual({
      x: 50,
      y: 50,
    });
  });
});

describe("getPolygonBoundingBox", () => {
  it("頂点を囲む矩形を返す", () => {
    expect(getPolygonBoundingBox("polygon(10% 20%, 60% 20%, 30% 90%)")).toEqual({
      left: 10,
      top: 20,
      width: 50,
      height: 70,
    });
  });
});
