import { afterEach, describe, expect, it, vi } from "vitest";
import { createMonitorPreview } from "./monitor-preview";
import { generateCollageMosaicPlacements } from "@/lib/utils/mosaic";

afterEach(() => vi.unstubAllGlobals());
const jpeg = "data:image/jpeg;base64,/9j/2Q==";
function fixture(count: number) {
  const drawImage = vi.fn();
  const toDataURL = vi.fn(() => jpeg);
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage }), toDataURL };
  vi.stubGlobal("document", { createElement: () => canvas });
  const tiles = generateCollageMosaicPlacements().slice(0,count).map((p,index) => ({
    dataset: { monitorRow: String(p.row), monitorCol: String(p.col), monitorSubmissionId: `photo-${index}` },
    querySelector: () => ({ naturalWidth:64,naturalHeight:64,decode:async()=>undefined }),
  }));
  return { container: { querySelectorAll: () => tiles } as unknown as HTMLElement, tiles, canvas, drawImage, toDataURL };
}

describe("会場モニターの全体画像", () => {
  it("写真を一枚へ詰め、文字の座標と投稿IDの順序を揃える", async () => {
    const f=fixture(21);
    const result=await createMonitorPreview(f.container);
    expect(result).toMatchObject({version:2,imageDataUrl:jpeg,atlas:{columns:20,rows:2}});
    expect(result.submissionIds).toEqual(Array.from({length:21},(_,i)=>`photo-${i}`));
    expect(result.atlas.placements).toEqual(generateCollageMosaicPlacements().slice(0,21).map(({row,col})=>({row,col})));
    expect([f.canvas.width,f.canvas.height]).toEqual([1280,128]);
    expect(f.drawImage).toHaveBeenCalledTimes(21);
    expect(f.drawImage.mock.calls[20].slice(-4)).toEqual([0,64,64,64]);
  });
  it("空枠はアトラスへ含めない", async () => {
    const f=fixture(1);
    const empty={dataset:{monitorRow:"0",monitorCol:"0"},querySelector:()=>null};
    const container={querySelectorAll:()=>[empty,...f.tiles]} as unknown as HTMLElement;
    expect((await createMonitorPreview(container)).submissionIds).toEqual(["photo-0"]);
    expect(f.drawImage).toHaveBeenCalledOnce();
  });
  it("不正な座標は配信しない", async () => {
    const f=fixture(1); f.tiles[0].dataset.monitorRow="0";
    await expect(createMonitorPreview(f.container)).rejects.toThrow();
  });
  it("容量超過時はJPEG品質を下げる", async () => {
    const f=fixture(1);
    const large=`data:image/jpeg;base64,${Buffer.alloc(200_001).toString("base64")}`;
    f.toDataURL.mockImplementation((...args: unknown[]) => Number(args[1]) >= .4 ? large : jpeg);
    expect((await createMonitorPreview(f.container)).imageDataUrl).toBe(jpeg);
    expect(f.toDataURL.mock.calls.length).toBeGreaterThan(1);
  });
  it("読み込めていない写真を含むプレビューを公開しない", async () => {
    const image = { complete: true, naturalWidth: 0, decode: vi.fn().mockRejectedValue(new Error("image failed")) };
    const tile = { querySelector: () => image, dataset: { monitorSubmissionId: "broken",monitorRow:"13",monitorCol:"5" } };
    const container = { querySelectorAll: () => [tile] } as unknown as HTMLElement;
    await expect(createMonitorPreview(container)).rejects.toThrow();
    expect(image.decode).toHaveBeenCalledOnce();
  });
});
