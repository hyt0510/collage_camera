import { describe, expect, it, vi } from "vitest";
import { FRAME_TEMPLATES, CAPTURE_PRESETS, buildThemeMapFromPreset } from "@/lib/collage-config";
import { randomizeThemeMap } from "@/lib/utils/riddles";

// server-only はサーバー外で import すると例外を投げるため、テストでは空にする
vi.mock("server-only", () => ({}));

const { parseSubmissionBody, isValidId, MAX_COLLAGE_BYTES } = await import("./submission-validation");

const WEBP_HEADER = Buffer.concat([
  Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(20),
]);
const PNG_HEADER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20),
]);

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    templateId: "shards-a",
    presetId: "festival-classic-a",
    collageDataUrl: dataUrl("image/webp", WEBP_HEADER),
    items: FRAME_TEMPLATES[0]!.polygons.map((p) => ({ polygonId: p.id, theme: buildThemeMapFromPreset(FRAME_TEMPLATES[0]!, CAPTURE_PRESETS[0]!)[p.id], dataUrl: "" })),
    ...overrides,
  };
}

describe("parseSubmissionBody", () => {
  it("グループ内で抽選した6枠を受け付ける", () => {
    const body = validBody();
    const map = randomizeThemeMap(FRAME_TEMPLATES[0]!, CAPTURE_PRESETS[0]!, () => 0);
    body.items = body.items.map(item => ({ ...item, theme: map[item.polygonId]! }));
    expect(parseSubmissionBody(body)?.items).toEqual(body.items);
  });

  it("抽選した謎解きの種類の入れ替えと通常お題の重複を拒否する", () => {
    const body = validBody();
    const map = randomizeThemeMap(FRAME_TEMPLATES[0]!, CAPTURE_PRESETS[0]!, () => 0);
    body.items = body.items.map(item => ({ ...item, theme: map[item.polygonId]! }));
    const wrongGroup = body.items.map((item, index) => index === 4 ? { ...item, theme: body.items[5]!.theme } : item);
    const duplicate = body.items.map((item, index) => index === 1 ? { ...item, theme: body.items[0]!.theme } : item);
    expect(parseSubmissionBody({ ...body, items: wrongGroup })).toBeNull();
    expect(parseSubmissionBody({ ...body, items: duplicate })).toBeNull();
  });

  it("正しい投稿を受け付け、中身から画像形式を判定する", () => {
    const parsed = parseSubmissionBody(validBody());
    expect(parsed?.collage.contentType).toBe("image/webp");
    expect(parsed?.items).toHaveLength(6);
  });

  it("webp と宣言された PNG は PNG として扱う（iPhone の Safari 対策）", () => {
    const parsed = parseSubmissionBody(validBody({ collageDataUrl: dataUrl("image/webp", PNG_HEADER) }));
    expect(parsed?.collage.contentType).toBe("image/png");
    expect(parsed?.collage.extension).toBe("png");
  });

  it("画像でない中身・画像以外の MIME・サイズ超過は拒否する", () => {
    expect(parseSubmissionBody(validBody({ collageDataUrl: dataUrl("image/webp", Buffer.from("<script>")) }))).toBeNull();
    expect(parseSubmissionBody(validBody({ collageDataUrl: dataUrl("text/html", WEBP_HEADER) }))).toBeNull();
    const huge = Buffer.concat([WEBP_HEADER, Buffer.alloc(MAX_COLLAGE_BYTES)]);
    expect(parseSubmissionBody(validBody({ collageDataUrl: dataUrl("image/webp", huge) }))).toBeNull();
  });

  it("未知のプリセット・テンプレート不一致・枠不足・重複・テーマ改ざんを拒否する", () => {
    const items = validBody().items;
    for (const overrides of [
      { presetId: "unknown" }, { templateId: "unknown" }, { templateId: "shards-4" },
      { items: items.slice(1) }, { items: items.map(() => items[0]) },
      { items: items.map((item) => ({ ...item, theme: "改ざん" })) },
    ]) {
      expect(parseSubmissionBody(validBody(overrides))).toBeNull();
    }
  });

  it("必須項目の欠落や型違いでは例外を投げずに null を返す", () => {
    for (const body of [
      null,
      "text",
      [],
      validBody({ items: undefined }),
      validBody({ items: [] }),
      validBody({ items: [null] }),
      validBody({ items: Array.from({ length: 13 }, () => ({ polygonId: "a1", theme: "" })) }),
      validBody({ items: [{ polygonId: "a1", theme: "x".repeat(201) }] }),
      validBody({ collageDataUrl: undefined }),
      validBody({ templateId: "../etc" }),
      validBody({ presetId: 123 }),
    ]) {
      expect(parseSubmissionBody(body)).toBeNull();
    }
  });
});

describe("isValidId", () => {
  it("英数字・ハイフン・アンダースコアのみ許可する", () => {
    expect(isValidId("abcDEF123_-")).toBe(true);
    expect(isValidId("a/b")).toBe(false);
    expect(isValidId("")).toBe(false);
    expect(isValidId("x".repeat(65))).toBe(false);
  });
});
