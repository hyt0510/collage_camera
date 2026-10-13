import "server-only";

import { db } from "@/lib/firebase-admin";
import {
  CAPTURE_PRESETS,
  buildThemeMapFromPreset,
  findTemplateById,
  getPresetById,
} from "@/lib/collage-config";

const DEFAULT_PRESET_ID = CAPTURE_PRESETS[0]?.id ?? "";

// Vercel ではサーバーのインスタンスが複数あり、再起動でメモリも消えるため、
// 運営が選んだプリセットは Firestore に保存する
const SETTINGS_COLLECTION = "settings";
const SETTINGS_DOC_ID = "capturePreset";

// 参加者は全員10秒ごとにプリセットを取りに来るため、読み取り回数を抑えるキャッシュ
// 運営が切り替えてから全員に届くまで、最大でこの時間だけ遅れる
const CACHE_TTL_MS = 10_000;
let cachedPresetId: string | null = null;
let cachedAt = 0;

async function loadActivePresetId(): Promise<string> {
  const now = Date.now();
  if (cachedPresetId && now - cachedAt < CACHE_TTL_MS) return cachedPresetId;

  try {
    const snapshot = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const presetId = snapshot.get("presetId");
    cachedPresetId = typeof presetId === "string" && getPresetById(presetId) ? presetId : DEFAULT_PRESET_ID;
  } catch (e) {
    // Firestore に届かなくても参加者の画面は止めず、直前の値か既定のプリセットで続ける
    console.error("Failed to load active preset:", e);
    cachedPresetId = cachedPresetId ?? DEFAULT_PRESET_ID;
  }
  cachedAt = now;
  return cachedPresetId;
}

export function listCapturePresets() {
  return CAPTURE_PRESETS.map((preset) => {
    const template = findTemplateById(preset.templateId);
    return {
      id: preset.id,
      name: preset.name,
      templateId: preset.templateId,
      templateName: template?.name ?? "Unknown template",
      themes: preset.themes,
    };
  });
}

function buildActivePreset(presetId: string) {
  const preset = getPresetById(presetId) ?? CAPTURE_PRESETS[0];
  if (!preset) {
    return null;
  }

  const template = findTemplateById(preset.templateId);
  if (!template) {
    return null;
  }

  return {
    id: preset.id,
    name: preset.name,
    templateId: template.id,
    templateName: template.name,
    polygons: template.polygons,
    themes: preset.themes,
    themeMap: buildThemeMapFromPreset(template, preset),
  };
}

export async function getActiveCapturePreset() {
  return buildActivePreset(await loadActivePresetId());
}

/**
 * 存在しないプリセットなら null を返す。Firestore への保存に失敗したら例外を投げる
 */
export async function setActiveCapturePreset(presetId: string) {
  const preset = getPresetById(presetId);
  if (!preset) {
    return null;
  }
  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set({
    presetId: preset.id,
    updatedAt: new Date().toISOString(),
  });
  cachedPresetId = preset.id;
  cachedAt = Date.now();
  return buildActivePreset(preset.id);
}
