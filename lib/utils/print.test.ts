import { describe, expect, it } from "vitest";
import { getLPrintLayout, getPrintLayout } from "@/lib/utils/print";

describe("getLPrintLayout", () => {
  it("L判の89×127mmを300ppi相当の縦向き画像にする", () => {
    const layout = getLPrintLayout(1080, 1920);
    expect(layout.width).toBe(1051);
    expect(layout.height).toBe(1500);
  });

  it("縦長のコラージュ全体を縦横比を変えず、用紙の高さまで大きくする", () => {
    const { photo } = getLPrintLayout(1080, 1920);
    expect(photo.width / photo.height).toBeCloseTo(9 / 16);
    expect(photo.height).toBe(1500);
    expect(photo.x + photo.width / 2).toBeCloseTo(525.5);
    expect(photo.y).toBe(0);
    expect(photo.x).toBeCloseTo(103.625);
    expect(photo.y + photo.height).toBe(1500);
  });

  it.each([
    [1920, 1080, 1051, 591.1875],
    [1000, 1000, 1051, 1051],
  ])("%i×%iの写真も切り落とさず中央に置く", (width, height, expectedWidth, expectedHeight) => {
    const { photo } = getLPrintLayout(width, height);
    expect(photo.width).toBeCloseTo(expectedWidth);
    expect(photo.height).toBeCloseTo(expectedHeight);
    expect(photo.x + photo.width / 2).toBeCloseTo(525.5);
    expect(photo.y + photo.height / 2).toBeCloseTo(750);
  });

  it.each([
    [0, 1920],
    [1080, 0],
    [-1, 1920],
    [1080, Number.NaN],
    [Number.POSITIVE_INFINITY, 1920],
  ])("寸法が不正な画像（%s×%s）は印刷画像にしない", (width, height) => {
    expect(() => getLPrintLayout(width, height)).toThrow();
  });
});

describe("チェキmini用の印刷レイアウト", () => {
  it("フィルムの外枠ではなく46×62mmの印画面に合うJPEGサイズにする", () => {
    const layout = getPrintLayout(1080, 1920, "mini");
    expect(layout.width).toBe(543);
    expect(layout.height).toBe(732);
  });

  it.each([[1080, 1920], [1920, 1080], [1000, 1000]])(
    "%i×%iの作品全体を切り落とさず、印画面に収める", (width, height) => {
      const layout = getPrintLayout(width, height, "mini");
      expect(layout.photo.width / layout.photo.height).toBeCloseTo(width / height);
      expect(layout.photo.x).toBeGreaterThanOrEqual(0);
      expect(layout.photo.y).toBeGreaterThanOrEqual(0);
      expect(layout.photo.x + layout.photo.width).toBeLessThanOrEqual(layout.width);
      expect(layout.photo.y + layout.photo.height).toBeLessThanOrEqual(layout.height);
      expect(layout.photo.x + layout.photo.width / 2).toBeCloseTo(271.5);
    },
  );

  it("L判は出力寸法を保ち、装飾用の余白を追加しない", () => {
    expect(getPrintLayout(1080, 1920, "L")).toEqual({
      width: 1051, height: 1500,
      photo: { x: 103.625, y: 0, width: 843.75, height: 1500 },
    });
  });

  it("チェキminiでも不正な画像サイズを拒否する", () => {
    expect(() => getPrintLayout(0, 1920, "mini")).toThrow("写真のサイズを確認できませんでした。");
  });
});
