import "server-only";
import { buildThemeMapFromPreset, findTemplateById, getPresetById } from "@/lib/collage-config";
import { isValidRandomThemeMap } from "@/lib/utils/riddles";

/**
 * 投稿APIに送られてくるデータの検証
 * クライアントは改ざんできる前提で、形・長さ・画像の中身をすべてサーバー側で確かめる
 */

// Vercel のリクエスト上限(4.5MB)に Base64 の膨らみ(約4/3倍)を見込んだ上限
export const MAX_COLLAGE_BYTES = 3 * 1024 * 1024;
const MAX_ITEMS = 12;
const MAX_THEME_LENGTH = 200;
// 個別画像は現在クライアントから送っていない(空文字)が、送られてきた場合に備えて上限を設ける
const MAX_ITEM_DATA_URL_LENGTH = 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type DecodedImage = {
  buffer: Buffer;
  contentType: "image/webp" | "image/png" | "image/jpeg";
  extension: "webp" | "png" | "jpg";
};

export type ValidSubmissionBody = {
  templateId: string;
  presetId: string;
  collage: DecodedImage;
  items: Array<{ polygonId: string; theme: string; dataUrl: string }>;
};

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

// 宣言された形式ではなく、実際のバイト列の先頭から画像形式を判定する
function detectImageType(buffer: Buffer): Omit<DecodedImage, "buffer"> | null {
  if (buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  return null;
}

function decodeImageDataUrl(value: unknown): DecodedImage | null {
  if (typeof value !== "string") return null;
  const match = /^data:image\/(?:webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  // デコード前に長さで弾き、巨大なデータをメモリに展開しない
  if (match[1]!.length > Math.ceil(MAX_COLLAGE_BYTES / 3) * 4) return null;

  const buffer = Buffer.from(match[1]!, "base64");
  if (buffer.length === 0 || buffer.length > MAX_COLLAGE_BYTES) return null;

  const type = detectImageType(buffer);
  return type ? { buffer, ...type } : null;
}

/**
 * 不正なら null を返す。理由はクライアントに詳しく返さない
 */
export function parseSubmissionBody(raw: unknown): ValidSubmissionBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;

  if (!isValidId(body.templateId) || !isValidId(body.presetId)) return null;
  const preset = getPresetById(body.presetId);
  const template = findTemplateById(body.templateId);
  if (!preset || !template || preset.templateId !== template.id) return null;

  const collage = decodeImageDataUrl(body.collageDataUrl);
  if (!collage) return null;

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    return null;
  }
  if (body.items.length !== template.polygons.length) return null;
  const themes = buildThemeMapFromPreset(template, preset);
  const slotIds = new Set(template.polygons.map((polygon) => polygon.id));

  const items: ValidSubmissionBody["items"] = [];
  for (const rawItem of body.items) {
    if (typeof rawItem !== "object" || rawItem === null) return null;
    const item = rawItem as Record<string, unknown>;
    if (!isValidId(item.polygonId)) return null;
    if (typeof item.theme !== "string" || item.theme.length > MAX_THEME_LENGTH) return null;
    if (!slotIds.delete(item.polygonId)) return null;
    const dataUrl = item.dataUrl ?? "";
    if (typeof dataUrl !== "string" || dataUrl.length > MAX_ITEM_DATA_URL_LENGTH) return null;
    items.push({ polygonId: item.polygonId, theme: item.theme, dataUrl });
  }

  // 作成途中の旧固定テーマも受け付け、新しい抽選は枠ごとの種類と重複を確認する。
  const isFixed = items.every(item => item.theme === themes[item.polygonId]);
  const themeMap = Object.fromEntries(items.map(item => [item.polygonId, item.theme]));
  if (!isFixed && !(preset.randomThemes && isValidRandomThemeMap(template, preset, themeMap))) return null;

  return { templateId: body.templateId, presetId: body.presetId, collage, items };
}
