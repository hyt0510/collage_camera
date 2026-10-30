import { FrameTemplate } from "@/lib/collage-config";
import { getCenteredPolygon } from "@/lib/utils/styles";

/**
 * デバッグログ付き画像処理ユーティリティ
 */

export function revokeBlobUrlIfNeeded(url: string | undefined) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file: File, onLog: (msg: string) => void): Promise<string> {
  onLog(`Starting compressImage: ${file.name} (${Math.round(file.size / 1024)}KB)`);
  
  const url = URL.createObjectURL(file);
  onLog(`ObjectURL created: ${url}`);

  try {
    const img = new Image();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Image load timeout (10s)")), 10000);
      
      img.onload = () => {
        clearTimeout(timeout);
        onLog(`Image decoded: ${img.width}x${img.height}`);
        
        const MAX = 800; // 1000から800に縮小
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        
        onLog(`Canvas sizing: ${canvas.width}x${canvas.height}`);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2d context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        onLog("DrawImage to canvas ok");
        
        // image/webp は一部の古いiOSで不安定または未対応のため image/jpeg を使用
        const result = canvas.toDataURL("image/jpeg", 0.7); 
        onLog(`toDataURL ok: ${Math.round(result.length / 1024)}KB Base64 (jpeg)`);
        resolve(result);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Image load failed"));
      };
      
      img.src = url;
    });
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
    onLog("ObjectURL revoked");
  }
}

// 端末のメモリを使い切らないよう、元ファイルの大きさに上限を設ける
const MAX_PHOTO_FILE_BYTES = 50 * 1024 * 1024;

export const PHOTO_LOAD_ERROR_MESSAGE =
  "この写真は読み込めませんでした。別の写真を選ぶか、カメラで撮影してください。";

/**
 * アルバムやOS標準カメラで選んだ写真を、投稿用の大きさに縮めて読み込む
 * 読み込めないときは PHOTO_LOAD_ERROR_MESSAGE の Error を投げる
 */
export async function loadPhotoFile(file: File): Promise<string> {
  if ((file.type && !file.type.startsWith("image/")) || file.size > MAX_PHOTO_FILE_BYTES) {
    throw new Error(PHOTO_LOAD_ERROR_MESSAGE);
  }
  try {
    return await compressImage(file, () => {});
  } catch {
    throw new Error(PHOTO_LOAD_ERROR_MESSAGE);
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * CSS の object-cover と同じく、描画先を隙間なく埋めるために元画像から切り出す範囲を求める
 */
export function getCoverSourceRect(imgW: number, imgH: number, destW: number, destH: number) {
  const imgRatio = imgW / imgH;
  const destRatio = destW / destH;
  if (imgRatio > destRatio) {
    // 画像の方が横長 -> 左右をカット
    const sw = imgH * destRatio;
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH };
  }
  // 画像の方が縦長 -> 上下をカット
  const sh = imgW / destRatio;
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh };
}

/** 中央の撮影枠で合わせた写真を、既存の合成処理で同じ構図になる位置へ戻す */
export function createSlotPhoto(image: HTMLImageElement, clipPath: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 450;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("写真を準備できませんでした。もう一度お試しください。");
  const { sx, sy, sw, sh } = getCoverSourceRect(image.naturalWidth, image.naturalHeight, canvas.width, canvas.height);
  const { offsetX, offsetY } = getCenteredPolygon(clipPath);
  ctx.drawImage(image, sx, sy, sw, sh,
    -offsetX * canvas.width / 100, -offsetY * canvas.height / 100, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function generateCollageImage(
  template: FrameTemplate,
  images: Record<string, string>,
  width = 1080,
  height = 1920
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context failed");

  // 背景を白に
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  for (const polygon of template.polygons) {
    const dataUrl = images[polygon.id];
    if (!dataUrl) continue;

    const img = await loadImage(dataUrl);

    // clipPathからポイントを抽出: "polygon(0% 0%, 60% 0%, ...)"
    const pointsStr = polygon.clipPath.match(/polygon\((.+)\)/)?.[1];
    if (!pointsStr) continue;

    const points = pointsStr.split(",").map(p => {
      const [x, y] = p.trim().split(/\s+/);
      return {
        x: (parseFloat(x!) / 100) * width,
        y: (parseFloat(y!) / 100) * height
      };
    });

    // ポリゴンのバウンディングボックスを計算
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    const polyW = maxX - minX;
    const polyH = maxY - minY;
    const centerX = minX + polyW / 2;
    const centerY = minY + polyH / 2;

    ctx.save();
    
    // 隙間を埋めるための処理: ポリゴンをそれぞれの中心から1.5%だけ拡大する
    ctx.translate(centerX, centerY);
    ctx.scale(1.015, 1.015);
    ctx.translate(-centerX, -centerY);

    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    ctx.closePath();
    ctx.clip();

    // 拡大は切り抜きの形だけに使い、写真は等倍で描く（クリップ領域は変形を戻しても残る）
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 撮影画面・プレビューと同じく、写真を画面全体に cover で敷いてから枠の形で切り抜く
    const { sx, sy, sw, sh } = getCoverSourceRect(img.width, img.height, width, height);

    // 0以下のサイズでの drawImage は SyntaxError (The string did not match the expected pattern) の原因になる
    const sourceW = Math.max(1, sw);
    const sourceH = Math.max(1, sh);

    ctx.drawImage(img, sx, sy, sourceW, sourceH, 0, 0, width, height);
    ctx.restore();
  }

  // iPhone の Safari は canvas から WebP を出力できず数MBの PNG になり、投稿上限を超えるため JPEG にする
  return canvas.toDataURL("image/jpeg", 0.85);
}

