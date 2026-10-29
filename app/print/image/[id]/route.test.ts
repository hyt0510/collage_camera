import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/submission-store", () => ({ getSubmissionImage: vi.fn() }));
vi.mock("@/lib/print-code-store", () => ({ resolvePrintCode: vi.fn() }));

import { getSubmissionImage } from "@/lib/submission-store";
import { resolvePrintCode } from "@/lib/print-code-store";
import { GET } from "./route";

const authorization = `Basic ${btoa("print:print-password")}`;

function readImage(id = "work-1", header: string | null = authorization, suffix = "") {
  return GET(new Request(`https://example.com/print/image/${id}${suffix}`, {
    headers: header ? { authorization: header } : {},
  }), { params: Promise.resolve({ id }) });
}

describe("印刷専用画像取得", () => {
  beforeEach(() => {
    vi.stubEnv("PRINT_PASSWORD", "print-password");
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "admin-password");
    vi.mocked(getSubmissionImage).mockReset();
    vi.mocked(resolvePrintCode).mockReset();
    vi.mocked(resolvePrintCode).mockResolvedValue(null);
    vi.mocked(getSubmissionImage).mockResolvedValue({
      buffer: Buffer.from([255, 216, 255, 217]), contentType: "image/jpeg",
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("6文字の受付番号から元の作品だけを取得する", async () => {
    vi.mocked(resolvePrintCode).mockResolvedValue("long-original-id");
    expect((await readImage("k7m-4px")).status).toBe(200);
    expect(resolvePrintCode).toHaveBeenCalledWith("k7m-4px");
    expect(getSubmissionImage).toHaveBeenCalledWith("long-original-id");
  });

  it("未登録の番号は別の作品として開かない", async () => {
    expect((await readImage("K7M4PX")).status).toBe(404);
    expect(getSubmissionImage).not.toHaveBeenCalled();
  });

  it.each([null, `Basic ${btoa("print:wrong")}`, `Basic ${btoa("staff:admin-password")}`])(
    "未認証・認証違いでは画像を読み出さない（%s）", async (header) => {
      const response = await readImage("work-1", header);
      expect(response.status).toBe(401);
      expect(getSubmissionImage).not.toHaveBeenCalled();
      expect(response.headers.get("Cache-Control")).toContain("no-store");
    },
  );

  it("認証済みの作品IDに対応する画像だけを返し、キャッシュさせない", async () => {
    const response = await readImage();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([255, 216, 255, 217]));
    expect(getSubmissionImage).toHaveBeenCalledWith("work-1");
  });

  it("個別写真の指定が付いていても完成コラージュだけを返す", async () => {
    const response = await readImage("work-1", authorization, "?item=0");
    expect(response.status).toBe(200);
    expect(getSubmissionImage).toHaveBeenCalledWith("work-1");
  });

  it("パスワード未設定では画像を読み出さない", async () => {
    vi.stubEnv("PRINT_PASSWORD", "");
    expect((await readImage()).status).toBe(503);
    expect(getSubmissionImage).not.toHaveBeenCalled();
  });

  it.each(["bad.id", "a".repeat(65)])("不正な作品IDでは画像を読み出さない（%s）", async (id) => {
    expect((await readImage(id)).status).toBe(404);
    expect(getSubmissionImage).not.toHaveBeenCalled();
  });

  it("存在しない作品には404を返す", async () => {
    vi.mocked(getSubmissionImage).mockResolvedValue(null);
    expect((await readImage()).status).toBe(404);
  });

  it("取得障害時は内部のエラーを公開せず503を返す", async () => {
    vi.mocked(getSubmissionImage).mockRejectedValue(new Error("internal storage detail"));
    const response = await readImage();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });
});
