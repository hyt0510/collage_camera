import { afterEach, describe, expect, it, vi } from "vitest";
import { getCoverSourceRect } from "./image";
import { compressImage, createSlotPhoto, generateCollageImage } from "@/lib/utils/image";

afterEach(() => vi.unstubAllGlobals());

function mockCanvas() {
  const context = {
    fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(), setTransform: vi.fn(),
  };
  const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: vi.fn(() => "data:image/jpeg;base64,test") };
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, context };
}

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

describe("印刷用写真の解像度", () => {
  it("配置用写真を完成画像と同じ解像度で保持し、構図を変えずに合成できる", async () => {
    const { canvas, context } = mockCanvas();
    createSlotPhoto({ naturalWidth: 1920, naturalHeight: 2560 } as HTMLImageElement,
      "polygon(0% 0%, 50% 0%, 50% 50%, 0% 50%)");
    const photoSize = [canvas.width, canvas.height];
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = context.drawImage.mock.calls[0]!;
    expect([sx, sy, sw, sh]).toEqual([240, 0, 1440, 2560]);
    expect(dx / dw).toBe(-0.25);
    expect(dy / dh).toBe(-0.25);
    expect(canvas.toDataURL).toHaveBeenLastCalledWith("image/jpeg", 0.95);
    await generateCollageImage({ id: "test", name: "test", polygons: [] }, {});
    expect([canvas.width, canvas.height]).toEqual([1080, 1920]);
    expect(photoSize).toEqual([canvas.width, canvas.height]);
    expect(canvas.toDataURL).toHaveBeenLastCalledWith("image/jpeg", 0.9);
  });

  it.each([
    { width: 4032, height: 3024, expected: [1920, 1440] },
    { width: 3024, height: 4032, expected: [1440, 1920] },
    { width: 640, height: 480, expected: [640, 480] },
  ])("$width × $height の写真を縦横比と細部を保って読み込む", async ({ width, height, expected }) => {
    const { canvas } = mockCanvas();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL });
    vi.stubGlobal("Image", class {
      width = width;
      height = height;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    const result = await compressImage(new File(["test"], "photo.jpg", { type: "image/jpeg" }), () => {});
    expect([canvas.width, canvas.height]).toEqual(expected);
    expect(canvas.toDataURL).toHaveBeenLastCalledWith("image/jpeg", 0.95);
    expect(result).toBe("data:image/jpeg;base64,test");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
