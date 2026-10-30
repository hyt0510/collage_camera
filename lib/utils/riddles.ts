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

const answers: Record<RiddleGroup, readonly (readonly [number, string, string])[]> = {
  gojuon: [
    [1, "学科展示", "がっかてんじ"], [2, "野球場", "やきゅうじょう"],
    [4, "テニスコート", "てにすこーと"], [5, "駐輪場", "ちゅうりんじょう"], [6, "渡り廊下", "わたりろうか"],
    [7, "白いベンチ", "しろいべんち"], [8, "消火器", "しょうかき"],
  ],
  arrows: [[1, "時計", "とけい"], [2, "傘立て", "かさたて"], [3, "倉庫", "そうこ"], [4, "校舎", "こうしゃ"]],
};

export const RIDDLES: Riddle[] = (Object.entries(answers) as [RiddleGroup, typeof answers[RiddleGroup]][])
  .flatMap(([group, list]) => list.map(([number, answer, reading]) => ({
    id: `${group}-${number}`,
    group,
    theme: `謎解き：${group === "gojuon" ? "五十音表" : "五十音表矢印"}${number}`,
    image: `/riddles/${group}-${number}.png`,
    answer,
    reading,
  })));

// お題.xlsx の「お題」シートから取り込んだ通常のお題（重複を除く）。
export const NORMAL_THEMES = [
  "バザーで一番おいしそうな食べ物を撮ろう",
  "行列ができてる店を撮ろう",
  "「絶対これ売れる！」と思った商品を撮ろう",
  "食べてる人の笑顔を撮ろう",
  "全力で笑ってる瞬間を撮ろう",
  "青春っぽい写真",
  "「主人公感」がある写真",
  "イケメン風ショット",
  "アイドルみたいなポーズ",
  "謎ポーズ",
  "思い出になりそうな1枚",
  "「3」が入ってるもの",
  "丸いもの",
  "文化祭っぽくない写真",
  "影がかっこいい写真",
  "“映り込み”写真",
  "テーマ「青春」で1枚",
  "テーマ「カオス」で1枚",
  "テーマ「映画のワンシーン」",
  "バズりそうな写真",
  "インスタ映え写真",
  "かわいい写真",
  "プリクラ感ある写真",
  "赤いものを撮ろう",
  "青いものを撮ろう",
  "黄色のものを撮ろう",
  "緑色のものを撮ろう",
  "黒色のものを撮ろう",
  "白色のものを撮ろう",
  "「１」が入っているものを撮ろう",
  "「２」が入っているものを撮ろう",
  "「４」が入っているものを撮ろう",
  "「５」が入っているものを撮ろう",
  "教室を撮ろう",
  "時計を撮ろう",
  "花壇を撮ろう",
  "木を撮ろう",
  "草を撮ろう",
  "花を撮ろう",
  "石を撮ろう",
  "窓を撮ろう",
  "茶色のものを撮ろう",
  "四角のものを撮ろう",
  "大きいものを撮ろう",
  "小さいものを撮ろう",
  "同じ色が3つある写真を撮ろう",
  "ふわふわしてそうなものを撮ろう",
  "硬そうなものを撮ろう",
  "柔らかそうなものを撮ろう",
  "重そうなものを撮ろう",
  "軽そうなものを撮ろう",
  "古そうなものを撮ろう",
  "新しそうなものを撮ろう",
  "面白い形のものを撮ろう",
  "不思議なものを撮ろう",
  "おしゃれなものを撮ろう",
  "シンプルなものを撮ろう",
  "隠れてるものを撮ろう",
  "アルファベットが入ったものを撮ろう",
  "漢字がいっぱいあるものを撮ろう",
  "ひらがなが入ったものを撮ろう",
  "一番かわいいものを撮ろう",
  "一番かっこいいものを撮ろう",
  "一番目立たないものを撮ろう",
  "一番文化祭っぽいものを撮ろう",
  "鏡に映ったものを撮ろう",
  "ガラス越しの写真を撮ろう",
  "空が入った写真を撮ろう",
  "太陽の光が入った写真を撮ろう",
  "明るい場所を撮ろう",
  "エモい雰囲気を撮ろう",
  "静かな場所を撮ろう",
  "笑顔の人を撮ろう",
  "ピースしてる人を撮ろう",
  "飲み物を撮ろう",
  "長いものを撮ろう",
  "高いところにあるものを撮ろう",
  "低いところにあるものを撮ろう",
  "数字が入っているものを撮ろう",
  "階段を撮ろう",
  "ドアを撮ろう",
  "椅子を撮ろう",
  "机を撮ろう",
  "音楽ライブしているところを撮ろう",
  "窓から見える景色を撮ろう",
  "天井を撮ろう",
  "床の模様を撮ろう",
  "ロッカーを撮ろう",
  "一番気合い入ってる展示を撮ろう",
  "校舎を撮ろう",
  "雲を撮ろう",
  "葉っぱを撮ろう",
  "体育館を撮ろう",
  "段ボールを撮ろう",
  "自販機を撮ろう",
  "同じものが並んでる場所を撮ろう",
  "反射だけで写真を撮ろう",
  "「１」が入った教室札を撮ろう",
  "「２」が入った教室札を撮ろう",
  "「３」が入った教室札を撮ろう",
  "「４」が入った教室札を撮ろう",
  "「５」が入った教室札を撮ろう",
  "漢字が入っている教室札を撮ろう",
  "カタカナが入っている教室札を撮ろう",
  "英語が入っている教室札を撮ろう",
  "ホワイトボードを撮ろう",
  "今日1番楽しかった場所で撮ろう",
  "１M  の教室札を撮ろう",
  "１E  の教室札を撮ろう",
  "１Ⅰの教室札を撮ろう",
  "１Cの教室札を撮ろう",
  "１Sの教室札を撮ろう",
  "２M  の教室札を撮ろう",
  "２E  の教室札を撮ろう",
  "２Ⅰの教室札を撮ろう",
  "２Cの教室札を撮ろう",
  "２Sの教室札を撮ろう",
  "３M  の教室札を撮ろう",
  "３E  の教室札を撮ろう",
  "３Ⅰの教室札を撮ろう",
  "３Cの教室札を撮ろう",
  "３Sの教室札を撮ろう",
  "４M  の教室札を撮ろう",
  "４E  の教室札を撮ろう",
  "４Ⅰの教室札を撮ろう",
  "４Cの教室札を撮ろう",
  "４Sの教室札を撮ろう",
  "５M  の教室札を撮ろう",
  "５E  の教室札を撮ろう",
  "５Ⅰの教室札を撮ろう",
  "５Cの教室札を撮ろう",
  "５Sの教室札を撮ろう",
  "第二体育館を撮ろう",
  "第一体育館を撮ろう",
  "野球場を撮ろう",
  "一番面白かった学科展示を撮ろう",
  "部活紹介の掲示板を撮ろう",
];

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
