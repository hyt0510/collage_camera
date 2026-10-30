import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_PRESETS, buildThemeMapFromPreset, findTemplateById } from "@/lib/collage-config";
import { findRiddleByTheme, isValidRandomThemeMap } from "@/lib/utils/riddles";

const { fetchJson } = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/services/api/request", () => ({ fetchJson }));
const { fetchAssignedPreset } = await import("@/services/api/collage");

function mockPreset(id: string) {
  const preset = CAPTURE_PRESETS.find(p => p.id === id)!;
  const template = findTemplateById(preset.templateId)!;
  const activePreset = {
    id, templateId: template.id, templateName: template.name,
    polygons: template.polygons, themeMap: buildThemeMapFromPreset(template, preset),
  };
  fetchJson.mockResolvedValue({ response: { ok: true }, payload: { activePreset } });
  return { preset, template, activePreset };
}

describe("参加者用のお題割り当て", () => {
  beforeEach(() => { vi.restoreAllMocks(); fetchJson.mockReset(); });

  it("両方の本番6枠に通常4問と各種類の謎解きを割り当てる", async () => {
    for (const id of ["festival-classic-a", "festival-shards-6-v3"]) {
      const { preset, template, activePreset } = mockPreset(id);
      const assigned = await fetchAssignedPreset();
      expect(isValidRandomThemeMap(template, preset, assigned.themeMap)).toBe(true);
      expect(assigned.themeMap).not.toEqual(activePreset.themeMap);
      expect(findRiddleByTheme(assigned.themeMap[template.polygons[4]!.id])?.group).toBe("gojuon");
      expect(findRiddleByTheme(assigned.themeMap[template.polygons[5]!.id])?.group).toBe("arrows");
    }
  });

  it("事前公開の固定お題は変更しない", async () => {
    const { activePreset } = mockPreset("pre-festival-home");
    expect(await fetchAssignedPreset()).toEqual(activePreset);
  });

  it("次の取得では新しい抽選を行い、保存用の割り当てを変更しない", async () => {
    mockPreset("festival-shards-6-v3");
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = await fetchAssignedPreset();
    const saved = JSON.stringify(first);
    vi.mocked(Math.random).mockReturnValue(0.999);
    const second = await fetchAssignedPreset();
    expect(second.themeMap).not.toEqual(first.themeMap);
    expect(JSON.stringify(first)).toBe(saved);
    expect(JSON.parse(saved)).toEqual(first);
  });
});
