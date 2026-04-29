import config from "./config.json";

export type PolygonSlot = {
  id: string;
  clipPath: string;
};

export type FrameTemplate = {
  id: string;
  name: string;
  polygons: PolygonSlot[];
};

export type CapturePreset = {
  id: string;
  name: string;
  templateId: string;
  themes: string[];
};

export const FRAME_TEMPLATES: FrameTemplate[] = [
  {
    id: "shards-a",
    name: "Shards A",
    polygons: [
      { id: "a1", clipPath: "polygon(0% 0%, 55% 0%, 65% 30%, 35% 45%, 0% 30%)" },
      { id: "a2", clipPath: "polygon(55% 0%, 100% 0%, 100% 40%, 65% 30%)" },
      { id: "a3", clipPath: "polygon(0% 30%, 35% 45%, 25% 75%, 0% 70%)" },
      { id: "a4", clipPath: "polygon(35% 45%, 65% 30%, 100% 40%, 85% 65%, 45% 80%, 25% 75%)" },
      { id: "a5", clipPath: "polygon(0% 70%, 25% 75%, 45% 100%, 0% 100%)" },
      { id: "a6", clipPath: "polygon(25% 75%, 45% 80%, 85% 65%, 100% 40%, 100% 100%, 45% 100%)" },
    ],
  },
  {
    id: "shards-4",
    name: "Shards 4",
    polygons: [
      { id: "q1", clipPath: "polygon(0% 0%, 65% 0%, 45% 45%, 0% 35%)" },
      { id: "q2", clipPath: "polygon(65% 0%, 100% 0%, 100% 65%, 45% 45%)" },
      { id: "q3", clipPath: "polygon(0% 35%, 45% 45%, 35% 100%, 0% 100%)" },
      { id: "q4", clipPath: "polygon(45% 45%, 100% 65%, 100% 100%, 35% 100%)" },
    ],
  },
  {
    id: "shards-5",
    name: "Shards 5",
    polygons: [
      { id: "p1", clipPath: "polygon(0% 0%, 60% 0%, 45% 35%, 0% 25%)" },
      { id: "p2", clipPath: "polygon(60% 0%, 100% 0%, 100% 45%, 45% 35%)" },
      { id: "p3", clipPath: "polygon(0% 25%, 45% 35%, 70% 60%, 35% 70%, 0% 65%)" },
      { id: "p4", clipPath: "polygon(0% 65%, 35% 70%, 55% 100%, 0% 100%)" },
      { id: "p5", clipPath: "polygon(45% 35%, 100% 45%, 100% 100%, 55% 100%, 35% 70%, 70% 60%)" },
    ],
  },
  {
    id: "shards-6-v2",
    name: "Shards 6 V2",
    polygons: [
      { id: "s1", clipPath: "polygon(0% 0%, 45% 0%, 35% 35%, 0% 30%)" },
      { id: "s2", clipPath: "polygon(45% 0%, 100% 0%, 100% 50%, 35% 35%)" },
      { id: "s3", clipPath: "polygon(0% 30%, 35% 35%, 55% 60%, 20% 70%, 0% 65%)" },
      { id: "s4", clipPath: "polygon(35% 35%, 100% 50%, 80% 75%, 55% 60%)" },
      { id: "s5", clipPath: "polygon(0% 65%, 20% 70%, 40% 100%, 0% 100%)" },
      { id: "s6", clipPath: "polygon(20% 70%, 55% 60%, 80% 75%, 100% 50%, 100% 100%, 40% 100%)" },
    ],
  },
];

export const CAPTURE_THEMES = config.themes;
export const CAPTURE_PRESETS: CapturePreset[] = config.presets;

export function findTemplateById(templateId: string): FrameTemplate | null {
  return FRAME_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getPresetById(presetId: string): CapturePreset | null {
  return CAPTURE_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function buildThemeMapFromPreset(template: FrameTemplate, preset: CapturePreset) {
  return template.polygons.reduce<Record<string, string>>((acc, polygon, index) => {
    acc[polygon.id] = preset.themes[index] ?? CAPTURE_THEMES[index % CAPTURE_THEMES.length] ?? "";
    return acc;
  }, {});
}

export function pickRandomTemplate(): FrameTemplate {
  return FRAME_TEMPLATES[Math.floor(Math.random() * FRAME_TEMPLATES.length)];
}
