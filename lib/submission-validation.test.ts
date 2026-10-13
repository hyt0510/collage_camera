import { describe, expect, it, vi } from "vitest";

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
    items: [{ polygonId: "a1", theme: "時計を撮ろう", dataUrl: "" }],
    ...overrides,
  };
}

describe("parseSubmissionBody", () => {
  it("正しい投稿を受け付け、中身から画像形式を判定する", () => {
    const parsed = parseSubmissionBody(validBody());
    expect(parsed?.collage.contentType).toBe("image/webp");
    expect(parsed?.items).toHaveLength(1);
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
