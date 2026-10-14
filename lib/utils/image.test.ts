import { describe, it, expect } from "vitest";
import { getCoverSourceRect } from "./image";

describe("getCoverSourceRect", () => {
  it("横長の写真を縦長の画面に敷くときは左右を切る", () => {
    // 1600x900 の写真を 9:16 に合わせると、高さ 900 に対して幅 506.25
    const rect = getCoverSourceRect(1600, 900, 1080, 1920);
    expect(rect.sh).toBe(900);
    expect(rect.sw).toBeCloseTo(506.25);
    expect(rect.sx).toBeCloseTo((1600 - 506.25) / 2);
    expect(rect.sy).toBe(0);
  });

  it("画面より縦長の写真は上下を切る", () => {
    const rect = getCoverSourceRect(900, 2000, 1080, 1920);
    expect(rect.sw).toBe(900);
    expect(rect.sh).toBeCloseTo(1600);
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBeCloseTo(200);
  });

  it("縦横比が同じなら切らない", () => {
    expect(getCoverSourceRect(450, 800, 1080, 1920)).toEqual({ sx: 0, sy: 0, sw: 450, sh: 800 });
  });
});
