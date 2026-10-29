import { getCoverSourceRect } from "@/lib/utils/image";
import { getMonitorAtlasLayout, parseMonitorAtlas, type MonitorAtlas } from "@/lib/utils/monitor-animation";

export type MonitorPreviewUpload = { version: 2; imageDataUrl: string; submissionIds: string[]; atlas: MonitorAtlas };

/** 読み込み済みの写真だけを1枚へ詰め、演出の各フレームは送信しない。 */
export async function createMonitorPreview(container: HTMLElement): Promise<MonitorPreviewUpload> {
  const entries = Array.from(container.querySelectorAll<HTMLElement>("[data-monitor-cell]")).flatMap((tile) => {
    const image = tile.querySelector("img");
    return image ? [{ tile, image, source: image.currentSrc || image.src, id: tile.dataset.monitorSubmissionId ?? "", row: Number(tile.dataset.monitorRow), col: Number(tile.dataset.monitorCol) }] : [];
  });
  const atlas = parseMonitorAtlas({ ...getMonitorAtlasLayout(entries.length), placements: entries.map(({row,col}) => ({row,col})) });
  if (!atlas || entries.some(({id}) => !id) || new Set(entries.map(({id})=>id)).size !== entries.length) throw new Error("写真の配置を確認できませんでした。");
  await Promise.all(entries.map(async ({image}) => {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("画像を読み込めませんでした。");
  }));
  const currentTiles = new Set(container.querySelectorAll<HTMLElement>("[data-monitor-cell]"));
  if (entries.some(({tile,image,source,id}) => !currentTiles.has(tile) || tile.dataset.monitorSubmissionId !== id || (image.currentSrc || image.src) !== source)) {
    throw new Error("写真が更新されました。次の更新で再生成します。");
  }
  const submissionIds = entries.map(({id})=>id);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("全体画像を作成できませんでした。");
  for (const cellSize of [64,48,32]) {
    canvas.width = atlas.columns * cellSize;
    canvas.height = atlas.rows * cellSize;
    ctx.fillStyle = "#F5F3EE";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    entries.forEach(({image},index) => {
      const {sx,sy,sw,sh}=getCoverSourceRect(image.naturalWidth,image.naturalHeight,cellSize,cellSize);
      ctx.drawImage(image,sx,sy,sw,sh,(index % atlas.columns)*cellSize,Math.floor(index/atlas.columns)*cellSize,cellSize,cellSize);
    });
    for (const quality of [.8,.6,.4,.25]) {
      const imageDataUrl = canvas.toDataURL("image/jpeg",quality);
      const base64 = imageDataUrl.slice(imageDataUrl.indexOf(",")+1);
      const bytes = base64.length*3/4-(base64.endsWith("==")?2:base64.endsWith("=")?1:0);
      const payload: MonitorPreviewUpload = { version:2,imageDataUrl,submissionIds,atlas };
      if (bytes <= 200_000 && new TextEncoder().encode(JSON.stringify(payload)).length <= 300_000) return payload;
    }
  }
  throw new Error("全体画像を200KB以下にできませんでした。");
}
