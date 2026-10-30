import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CAPTURE_PRESETS, findTemplateById } from "@/lib/collage-config";
import { RIDDLES, findRiddleByTheme, isCorrectRiddleAnswer, randomizeThemeMap, isValidRandomThemeMap } from "@/lib/utils/riddles";

const preset = CAPTURE_PRESETS.find(p => p.id === "festival-shards-6-v3")!;
const template = findTemplateById(preset.templateId)!;

describe("謎解きとお題の抽選", () => {
  it("Excelのお題を先頭から末尾まで抽選でき、投稿時にも受け付ける", () => {
    const first = randomizeThemeMap(template, preset, () => 0);
    const last = randomizeThemeMap(template, preset, () => 0.999);
    expect(first[template.polygons[0]!.id]).toBe("バザーで一番おいしそうな食べ物を撮ろう");
    expect(last[template.polygons[0]!.id]).toBe("部活紹介の掲示板を撮ろう");
    expect(isValidRandomThemeMap(template, preset, first)).toBe(true);
    expect(isValidRandomThemeMap(template, preset, last)).toBe(true);
  });

  it("通常4問を重複なし、五十音表・矢印を各1問抽選する", () => {
    const map = randomizeThemeMap(template, preset, () => 0);
    const normal = template.polygons.slice(0, 4).map(p => map[p.id]);
    expect(new Set(normal).size).toBe(4);
    expect(normal.every(theme => !findRiddleByTheme(theme))).toBe(true);
    expect(findRiddleByTheme(map[template.polygons[4]!.id])?.group).toBe("gojuon");
    expect(findRiddleByTheme(map[template.polygons[5]!.id])?.group).toBe("arrows");
    expect(isValidRandomThemeMap(template, preset, map)).toBe(true);
  });

  it("乱数によって各種類の別問題を選び、元の設定を変更しない", () => {
    const original = JSON.stringify(preset);
    const first = randomizeThemeMap(template, preset, () => 0);
    const last = randomizeThemeMap(template, preset, () => 0.999);
    expect(first).not.toEqual(last);
    expect(first[template.polygons[4]!.id]).not.toBe(last[template.polygons[4]!.id]);
    expect(first[template.polygons[5]!.id]).not.toBe(last[template.polygons[5]!.id]);
    expect(JSON.stringify(preset)).toBe(original);
    expect(RIDDLES.filter(r => r.group === "gojuon")).toHaveLength(7);
    expect(RIDDLES.filter(r => r.group === "arrows")).toHaveLength(4);
  });

  it("弓道場・屋外プールを除外し、残る問題と画像の対応を維持する", () => {
    expect(RIDDLES.some(riddle => ["弓道場", "屋外プール"].includes(riddle.answer))).toBe(false);
    expect(RIDDLES.find(riddle => riddle.id === "gojuon-4")?.answer).toBe("テニスコート");
    expect(RIDDLES.find(riddle => riddle.id === "gojuon-8")?.answer).toBe("消火器");
    for (const riddle of RIDDLES) expect(existsSync(resolve("public", riddle.image.slice(1)))).toBe(true);
    expect(existsSync(resolve("public/riddles/gojuon-3.png"))).toBe(false);
    expect(existsSync(resolve("public/riddles/gojuon-9.png"))).toBe(false);
  });

  it("種類違い・通常問題の重複・未知のお題・枠不足を拒否する", () => {
    const map = randomizeThemeMap(template, preset, () => 0);
    const ids = template.polygons.map(p => p.id);
    expect(isValidRandomThemeMap(template, preset, { ...map, [ids[4]!]: map[ids[5]!]! })).toBe(false);
    expect(isValidRandomThemeMap(template, preset, { ...map, [ids[1]!]: map[ids[0]!]! })).toBe(false);
    expect(isValidRandomThemeMap(template, preset, { ...map, [ids[0]!]: "未知のお題" })).toBe(false);
    const missing = { ...map };
    delete missing[ids[0]!];
    expect(isValidRandomThemeMap(template, preset, missing)).toBe(false);
  });
});

describe("場所名の正解判定", () => {
  it("漢字・ひらがな・カタカナ・半角カナ・空白を同じ答えとして扱う", () => {
    const riddle = RIDDLES.find(r => r.answer === "学科展示")!;
    for (const answer of ["学科展示", " がっかてんじ　", "ガッカテンジ", "ｶﾞｯｶﾃﾝｼﾞ", "学科 展示"]) {
      expect(isCorrectRiddleAnswer(riddle, answer)).toBe(true);
    }
  });

  it("別の場所・部分一致・空欄は不正解にする", () => {
    const riddle = RIDDLES.find(r => r.answer === "学科展示")!;
    for (const answer of ["野球場", "展示", "", "　"]) expect(isCorrectRiddleAnswer(riddle, answer)).toBe(false);
  });
});
