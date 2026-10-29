type PrintPhotoRect = { x: number; y: number; width: number; height: number };

export const PRINT_FORMATS = {
  L: { label: "L判", widthMm: 89, heightMm: 127 },
  mini: { label: "チェキmini", widthMm: 46, heightMm: 62 },
} as const;

export type PrintFormat = keyof typeof PRINT_FORMATS;

/** 写真全体を300ppi相当の印画面に、縦横比を保って収める。 */
export function getPrintLayout(imageWidth: number, imageHeight: number, format: PrintFormat = "L") {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("写真のサイズを確認できませんでした。");
  }
  const { widthMm, heightMm } = PRINT_FORMATS[format];
  const width = Math.round(widthMm / 25.4 * 300);
  const height = Math.round(heightMm / 25.4 * 300);
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const photo: PrintPhotoRect = {
    x: (width - imageWidth * scale) / 2,
    y: (height - imageHeight * scale) / 2,
    width: imageWidth * scale,
    height: imageHeight * scale,
  };
  return { width, height, photo };
}

export function getLPrintLayout(imageWidth: number, imageHeight: number) {
  return getPrintLayout(imageWidth, imageHeight, "L");
}

/** 元の写真全体を残し、余白を同じ写真のぼかし背景で埋めた印刷用JPEGをつくる。 */
export function generatePrintImage(image: HTMLImageElement, format: PrintFormat = "L"): string {
  const { width, height, photo } = getPrintLayout(image.naturalWidth, image.naturalHeight, format);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("印刷画像を作成できませんでした。別のブラウザでお試しください。");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  if (photo.width < width || photo.height < height) {
    const blur = 30 * width / 1051;
    // ぼかしの端が白くならないよう、印画面より外側まで背景を描く。
    const backgroundScale = Math.max((width + blur * 4) / image.naturalWidth, (height + blur * 4) / image.naturalHeight);
    const backgroundWidth = image.naturalWidth * backgroundScale;
    const backgroundHeight = image.naturalHeight * backgroundScale;
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, (width - backgroundWidth) / 2, (height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);
    ctx.restore();
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, photo.x, photo.y, photo.width, photo.height);
  return canvas.toDataURL("image/jpeg", 0.95);
}
