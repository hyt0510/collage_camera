import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/submission-store", () => ({ getSubmissionImage: state.read }));
const { GET } = await import("./route");
const auth = { authorization: `Basic ${btoa("staff:test-password")}` };
const context = { params: Promise.resolve({ id: "one" }) };

beforeEach(() => {
  vi.stubEnv("ADMIN_USER", "staff");
  vi.stubEnv("ADMIN_PASSWORD", "test-password");
  state.read.mockReset();
  state.read.mockResolvedValue({ buffer: Buffer.from("photo"), contentType: "image/jpeg" });
});
afterEach(() => vi.unstubAllEnvs());

describe("写真の認証付き配信", () => {
  it.each([undefined, `Basic ${btoa("staff:wrong")}`, "Bearer anonymous-token"])("認証できなければ画像を取得しない", async (authorization) => {
    const response = await GET(new Request("https://example.com/api/submissions/one/image", { headers: authorization ? { authorization } : undefined }), context);
    expect(response.status).toBe(401);
    expect(state.read).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("認証設定がなければ閉じたままにする", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const response = await GET(new Request("https://example.com/api/submissions/one/image", { headers: auth }), context);
    expect(response.status).toBe(503);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("認証後に画像本体を返し、URLへのリダイレクトやキャッシュをしない", async () => {
    const response = await GET(new Request("https://example.com/api/submissions/one/image", { headers: auth }), context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("photo");
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("旧投稿の個別画像も番号を指定して取得できる", async () => {
    await GET(new Request("https://example.com/api/submissions/one/image?item=1", { headers: auth }), context);
    expect(state.read).toHaveBeenCalledWith("one", 1);
  });

  it.each(["-1", "1.5", "NaN", "", "9999999999999999999999"])("不正な画像番号%sを拒否する", async (item) => {
    const response = await GET(new Request(`https://example.com/api/submissions/one/image?item=${item}`, { headers: auth }), context);
    expect(response.status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("不正な投稿IDを拒否する", async () => {
    const response = await GET(new Request("https://example.com/api/submissions/one/image", { headers: auth }), { params: Promise.resolve({ id: "../secret" }) });
    expect(response.status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("削除済みの画像には404を返す", async () => {
    state.read.mockResolvedValue(null);
    const response = await GET(new Request("https://example.com/api/submissions/one/image", { headers: auth }), context);
    expect(response.status).toBe(404);
  });

  it("取得に失敗しても公開URLへ切り替えない", async () => {
    state.read.mockRejectedValue(new Error("Storage failed"));
    const response = await GET(new Request("https://example.com/api/submissions/one/image", { headers: auth }), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
