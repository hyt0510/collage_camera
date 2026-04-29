import { FrameTemplate } from "@/lib/collage-config";

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
        
        const MAX = 1000;
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
        
        const result = canvas.toDataURL("image/jpeg", 0.75);
        onLog(`toDataURL ok: ${Math.round(result.length / 1024)}KB Base64`);
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

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
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

    // 画像を中央配置（cover/center-crop）
    const imgRatio = img.width / img.height;
    const polyRatio = polyW / polyH;

    let sx, sy, sw, sh;
    if (imgRatio > polyRatio) {
      // 画像の方が横長 -> 左右をカット
      sh = img.height;
      sw = sh * polyRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // 画像の方が縦長 -> 上下をカット
      sw = img.width;
      sh = sw / polyRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, minX, minY, polyW, polyH);
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

