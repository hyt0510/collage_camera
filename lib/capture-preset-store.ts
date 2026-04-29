import "server-only";

import {
  CAPTURE_PRESETS,
  buildThemeMapFromPreset,
  findTemplateById,
  getPresetById,
} from "@/lib/collage-config";

let activePresetId = CAPTURE_PRESETS[0]?.id ?? "";

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

export function getActiveCapturePreset() {
  const preset = getPresetById(activePresetId) ?? CAPTURE_PRESETS[0];
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

export function setActiveCapturePreset(presetId: string) {
  const preset = getPresetById(presetId);
  if (!preset) {
    return null;
  }
  activePresetId = preset.id;
  return getActiveCapturePreset();
}
