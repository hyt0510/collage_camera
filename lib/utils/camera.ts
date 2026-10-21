/** 指の距離に合わせて、デジタルズームを1〜4倍に収める。 */
export function getPinchZoom(startZoom: number, startDistance: number, distance: number) {
  if (startDistance <= 0) return startZoom;
  return Math.min(4, Math.max(1, startZoom * distance / startDistance));
}

/** プレビューの中央拡大と同じ範囲を撮影する。 */
export function getCameraSourceRect(width: number, height: number, zoom: number) {
  const sw = width / zoom;
  const sh = height / zoom;
  return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh };
}
