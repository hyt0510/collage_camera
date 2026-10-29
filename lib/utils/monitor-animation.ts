import { generateCollageMosaicPlacements, GRID_COLS, GRID_ROWS } from "@/lib/utils/mosaic";

export type MonitorPlacement = { row: number; col: number };
export type MonitorAtlas = { columns: number; rows: number; placements: MonitorPlacement[] };
export type MonitorAnimationPhase = "scatter" | "gather" | "hold" | "release";

const placementIndices = new Map(generateCollageMosaicPlacements().map((p, index) => [`${p.row}-${p.col}`, index]));
const letterHeights = [-1.5, 1, -.6, 1.7, -1.2, .65, -.15];
const roundedCorners = [
  [[0, 0], [0, 10]],
  [[0, 0], [6, 0], [0, 10], [6, 10]],
  [[0, 10]],
  [[0, 10]],
  [[0, 0], [6, 0]],
  [[0, 0], [0, 10], [6, 10]],
  [[0, 0], [0, 10]],
];
let scatteredPositions: Array<{ x: number; y: number }> | undefined;

/** 候補の中から既存の写真と離れた位置を選び、行列を作らず全体へ広げる。 */
function createScatteredPositions() {
  const positions: Array<{ x: number; y: number }> = [];
  let seed = 1799;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4_294_967_296;
  };
  for (let index = 0; index < placementIndices.size; index++) {
    let best = { x: .5, y: .5 };
    let bestDistance = -1;
    for (let candidate = 0; candidate < 24; candidate++) {
      const point = { x: .065 + random() * .87, y: .10 + random() * .80 };
      let distance = Infinity;
      for (const existing of positions) {
        const dx = (point.x - existing.x) * 16 / 9;
        const dy = point.y - existing.y;
        distance = Math.min(distance, dx * dx + dy * dy);
      }
      if (distance > bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    positions.push(best);
  }
  return positions;
}

export function getMonitorAnimationState(elapsed: number): { phase: MonitorAnimationPhase; assembled: boolean; nextInMs: number } {
  const time = Math.max(0, elapsed) % 120_000;
  if (time < 100_000) return { phase: "scatter", assembled: false, nextInMs: 100_000 - time };
  if (time < 104_000) return { phase: "gather", assembled: true, nextInMs: 104_000 - time };
  if (time < 116_000) return { phase: "hold", assembled: true, nextInMs: 116_000 - time };
  return { phase: "release", assembled: false, nextInMs: 120_000 - time };
}

/** 写真の追加順ではなく、文字の座標から散開位置を固定する。 */
export function getMonitorTileLayout(placement: MonitorPlacement, assembled: boolean, count: number) {
  const rotation = ((placement.row * 13 + placement.col * 7) % 21) - 10;
  if (assembled) {
    const letter = Math.floor((placement.col - 5) / 8);
    const localX = placement.col - (5 + letter * 8) + .5;
    const localY = placement.row - 13 + .5;
    let x = placement.col + .5;
    let y = placement.row + .5 + (letterHeights[letter] ?? 0);
    // 論理上のrow/colは維持し、角の写真だけを内側へ寄せて丸い輪郭にする。
    for (const [cornerX, cornerY] of roundedCorners[letter] ?? []) {
      const dx = Math.abs(localX - cornerX);
      const dy = Math.abs(localY - cornerY);
      if (dx < 2.5 && dy < 2.5) {
        const inset = (1 - dx / 2.5) * (1 - dy / 2.5) * .9;
        x += cornerX === 0 ? inset : -inset;
        y += cornerY === 0 ? inset : -inset;
      }
    }
    return { x: x / GRID_COLS, y: y / GRID_ROWS, width: 1 / GRID_COLS, rotation };
  }
  const ordinal = placementIndices.get(`${placement.row}-${placement.col}`) ?? 0;
  scatteredPositions ??= createScatteredPositions();
  return {
    ...scatteredPositions[ordinal],
    width: count <= 12 ? .09 : count <= 48 ? .06 : .032,
    rotation,
  };
}

export function getMonitorAtlasLayout(count: number): { columns: number; rows: number } {
  const columns = Math.min(20, Math.max(1, count));
  return { columns, rows: Math.max(1, Math.ceil(count / columns)) };
}

/** 公開する配置情報は座標だけに絞り、未知の場所や重複を拒否する。 */
export function parseMonitorAtlas(value: unknown): MonitorAtlas | null {
  if (typeof value !== "object" || value === null) return null;
  const { columns, rows, placements } = value as Record<string, unknown>;
  if (!Array.isArray(placements) || placements.length > placementIndices.size) return null;
  const layout = getMonitorAtlasLayout(placements.length);
  if (columns !== layout.columns || rows !== layout.rows) return null;
  const seen = new Set<string>();
  const normalized: MonitorPlacement[] = [];
  for (const item of placements) {
    if (typeof item !== "object" || item === null) return null;
    const { row, col } = item as Record<string, unknown>;
    if (typeof row !== "number" || typeof col !== "number" || !Number.isInteger(row) || !Number.isInteger(col)) return null;
    const key = `${row}-${col}`;
    if (!placementIndices.has(key) || seen.has(key)) return null;
    seen.add(key);
    normalized.push({ row, col });
  }
  return { ...layout, placements: normalized };
}
