/**
 * スタイル・座標計算関連のユーティリティ
 */

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const validHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;
  const value = Number.parseInt(validHex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * polygon(0% 0%, ...) を SVG points="0,0 ..." に変換
 */
export function toSvgPolygonPoints(clipPath: string): string {
  return clipPath
    .replace(/polygon\((.*)\)/, "$1")
    .split(",")
    .map(point => point.trim().replace(/\s+/g, ",").replace(/%/g, ""))
    .join(" ");
}

/**
 * ポリゴンの中心座標（重心）を計算する
 */
export function getPolygonCenter(clipPath: string): { x: number; y: number } {
  try {
    const points = clipPath
      .replace(/polygon\((.*)\)/, "$1")
      .split(",")
      .map(p => p.trim().split(/\s+/).map(v => parseFloat(v.replace("%", ""))));
    
    let x = 0, y = 0;
    points.forEach(p => {
      x += p[0] ?? 0;
      y += p[1] ?? 0;
    });
    return { x: x / points.length, y: y / points.length };
  } catch {
    return { x: 50, y: 50 };
  }
}

/**
 * ポリゴンの境界ボックス（Bounding Box）を計算する
 */
export function getPolygonBoundingBox(clipPath: string) {
  try {
    const points = clipPath
      .replace(/polygon\((.*)\)/, "$1")
      .split(",")
      .map(p => p.trim().split(/\s+/).map(v => parseFloat(v.replace("%", ""))));
    
    const xs = points.map(p => p[0] ?? 0);
    const ys = points.map(p => p[1] ?? 0);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  } catch {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
}
