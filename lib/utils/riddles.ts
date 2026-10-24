import config from "@/lib/config.json";
import type { CapturePreset, FrameTemplate } from "@/lib/collage-config";

export type RiddleGroup = "gojuon" | "arrows";
export type Riddle = {
  id: string;
  group: RiddleGroup;
  theme: string;
  image: string;
  answer: string;
  reading: string;
};

const answers: Record<RiddleGroup, readonly (readonly [string, string])[]> = {
  gojuon: [
    ["学科展示", "がっかてんじ"], ["野球場", "やきゅうじょう"], ["弓道場", "きゅうどうじょう"],
    ["テニスコート", "てにすこーと"], ["駐輪場", "ちゅうりんじょう"], ["渡り廊下", "わたりろうか"],
    ["白いベンチ", "しろいべんち"], ["消火器", "しょうかき"], ["屋外プール", "おくがいぷーる"],
  ],
  arrows: [["時計", "とけい"], ["傘立て", "かさたて"], ["倉庫", "そうこ"], ["校舎", "こうしゃ"]],
};

export const RIDDLES: Riddle[] = (Object.entries(answers) as [RiddleGroup, typeof answers[RiddleGroup]][])
  .flatMap(([group, list]) => list.map(([answer, reading], index) => ({
    id: `${group}-${index + 1}`,
    group,
    theme: `謎解き：${group === "gojuon" ? "五十音表" : "五十音表矢印"}${index + 1}`,
    image: `/riddles/${group}-${index + 1}.png`,
    answer,
    reading,
  })));

// 通常のお題は既存の撮影テーマ全体から選び、事前公開専用のものは混ぜない。
export const NORMAL_THEMES = [...new Set([
  ...config.themes,
  ...config.presets.filter(preset => preset.prizeEligible !== false).flatMap(preset => preset.themes),
])];

export function findRiddleByTheme(theme: string | undefined | null): Riddle | null {
  return RIDDLES.find(riddle => riddle.theme === theme) ?? null;
}

function normalizeAnswer(value: string): string {
  return value.normalize("NFKC").replace(/\s/g, "").replace(/[ァ-ヶ]/g, character =>
    String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function isCorrectRiddleAnswer(riddle: Riddle, answer: string): boolean {
  const normalized = normalizeAnswer(answer);
  return normalized === normalizeAnswer(riddle.answer) || normalized === riddle.reading;
}

export function randomizeThemeMap(
  template: FrameTemplate, preset: CapturePreset, random: () => number = Math.random,
): Record<string, string> {
  const remaining = [...NORMAL_THEMES];
  return Object.fromEntries(template.polygons.map((polygon, index) => {
    const group = preset.riddleSlots?.[String(index)];
    if (group) {
      const pool = RIDDLES.filter(riddle => riddle.group === group);
      return [polygon.id, pool[Math.floor(random() * pool.length)]!.theme];
    }
    return [polygon.id, remaining.splice(Math.floor(random() * remaining.length), 1)[0]!];
  }));
}

export function isValidRandomThemeMap(
  template: FrameTemplate, preset: CapturePreset, themeMap: Record<string, string>,
): boolean {
  if (Object.keys(themeMap).length !== template.polygons.length) return false;
  const normal = new Set<string>();
  return template.polygons.every((polygon, index) => {
    const theme = themeMap[polygon.id];
    if (typeof theme !== "string") return false;
    const group = preset.riddleSlots?.[String(index)];
    if (group) return findRiddleByTheme(theme)?.group === group;
    if (!NORMAL_THEMES.includes(theme) || normal.has(theme)) return false;
    normal.add(theme);
    return true;
  });
}

// 正解状態を出題内容に結び付け、前の作品の解除や旧QRで別問題を開けないようにする。
export function getRiddleUnlockId(presetId: string, slotIndex: number, riddle: Riddle): string {
  return `riddle:${presetId}:${slotIndex}:${riddle.id}`;
}
