import { describe, expect, it } from "vitest";
import { generateCollageMosaicPlacements } from "@/lib/utils/mosaic";
import { getMonitorAnimationState, getMonitorTileLayout, getMonitorAtlasLayout, parseMonitorAtlas } from "./monitor-animation";

const placements = generateCollageMosaicPlacements().map(({ row, col }) => ({ row, col }));
describe("モニターの2分周期", () => {
  it.each([[0,"scatter"],[99_999,"scatter"],[100_000,"gather"],[104_000,"hold"],[116_000,"release"],[120_000,"scatter"],[224_000,"hold"]])("%s msで%sになる", (elapsed, phase) => {
    expect(getMonitorAnimationState(Number(elapsed)).phase).toBe(phase);
    expect(getMonitorAnimationState(Number(elapsed)).nextInMs).toBeGreaterThan(0);
  });
  it("集結と保持だけ文字の形にする", () => {
    expect(getMonitorAnimationState(100_000).assembled).toBe(true);
    expect(getMonitorAnimationState(104_000).assembled).toBe(true);
    expect(getMonitorAnimationState(116_000).assembled).toBe(false);
  });
});
describe("写真の配置", () => {
  it.each([1,12,48,278])("%s枚でも写真が画面内に収まる", (count) => {
    for (const placement of placements) {
      for (const assembled of [false,true]) {
        const layout = getMonitorTileLayout(placement, assembled, count);
        expect(layout.x - layout.width / 2).toBeGreaterThanOrEqual(0);
        expect(layout.x + layout.width / 2).toBeLessThanOrEqual(1);
        expect(layout.y - layout.width * 16 / 9 / 2).toBeGreaterThanOrEqual(0);
        expect(layout.y + layout.width * 16 / 9 / 2).toBeLessThanOrEqual(1);
      }
    }
  });
  it("写真の追加・順序変更でも散開位置を保つ", () => {
    const photo = placements[42];
    expect(getMonitorTileLayout(photo,false,30)).toMatchObject({x:getMonitorTileLayout(photo,false,31).x,y:getMonitorTileLayout(photo,false,31).y});
  });
  it("文字の幅と同じ文字内の行間を保つ", () => {
    const first=getMonitorTileLayout({row:16,col:5},true,278);
    const next=getMonitorTileLayout({row:17,col:5},true,278);
    expect(first.width).toBe(1/64);
    expect(first.x).toBe((5+.5)/64);
    expect(next.y-first.y).toBeCloseTo(1/36);
  });
  it("全278枚を異なる散開位置に配置する", () => {
    expect(new Set(placements.map(p=>{const l=getMonitorTileLayout(p,false,278);return `${l.x},${l.y}`;})).size).toBe(278);
  });
  it("散開は行列に揃えず、画面全体へ広がる", () => {
    const layout=placements.map(p=>getMonitorTileLayout(p,false,278));
    expect(new Set(layout.map(p=>p.x)).size).toBeGreaterThan(250);
    expect(new Set(layout.map(p=>p.y)).size).toBeGreaterThan(250);
    expect(Math.max(...layout.map(p=>p.x))-Math.min(...layout.map(p=>p.x))).toBeGreaterThan(.85);
    expect(Math.max(...layout.map(p=>p.y))-Math.min(...layout.map(p=>p.y))).toBeGreaterThan(.75);
  });
  it("隣り合う文字の高さをずらす", () => {
    const heights=Array.from({length:7},(_,index)=>getMonitorTileLayout({row:16,col:5+index*8},true,278).y);
    expect(new Set(heights).size).toBe(7);
    expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(2/36);
  });
  it("Oの四隅を内側へ寄せ、直線部分より丸くする", () => {
    const topLeft=getMonitorTileLayout({row:13,col:13},true,278);
    const topMiddle=getMonitorTileLayout({row:13,col:15},true,278);
    const bottomLeft=getMonitorTileLayout({row:22,col:13},true,278);
    const bottomMiddle=getMonitorTileLayout({row:22,col:15},true,278);
    expect(topLeft.x).toBeGreaterThan(13.5/64);
    expect(topLeft.y).toBeGreaterThan(topMiddle.y);
    expect(bottomLeft.x).toBeGreaterThan(13.5/64);
    expect(bottomLeft.y).toBeLessThan(bottomMiddle.y);
  });
});
describe("アトラスの寸法と検証", () => {
  it.each([[0,1,1],[1,1,1],[21,20,2],[278,20,14]])("%s枚を%s列%s行へまとめる", (count,columns,rows) => {
    expect(getMonitorAtlasLayout(count)).toEqual({columns,rows});
  });
  it("正しい配置だけ受け入れ、個人情報は引き継がない", () => {
    expect(parseMonitorAtlas({columns:1,rows:1,placements:[{...placements[0],userId:"private"}],userId:"private"})).toEqual({columns:1,rows:1,placements:[placements[0]]});
  });
  it.each([null,{columns:0,rows:1,placements:[]},{columns:1,rows:1,placements:[{row:0,col:0}]},{columns:1,rows:1,placements:[placements[0],placements[0]]},{columns:20,rows:14,placements:Array(279).fill(placements[0])}])("不正な配置情報を拒否する", value => {
    expect(parseMonitorAtlas(value)).toBeNull();
  });
});
