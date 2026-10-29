import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorPreviewBudgetError } from "@/lib/monitor-preview-budget";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/monitor-preview-store", () => ({ getMonitorPreview: state.get, saveMonitorPreview: state.save }));
const { GET, POST } = await import("./route");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const auth = { authorization: `Basic ${btoa("staff:preview-test")}`, "content-type": "application/json" };
const body = { imageDataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, submissionIds: ["approved"] };
const upload = (value: unknown = body) => new Request("https://example.com/api/monitor-preview", { method: "POST", headers: auth, body: JSON.stringify(value) });

describe("モニタープレビューAPI", () => {
  it("V2はJPEGと座標だけをJSONで返す", async () => {
    const atlas={columns:1,rows:1,placements:[{row:13,col:5}]};
    state.get.mockResolvedValue({buffer:jpeg,updatedAt:Date.now(),etag:'"atlas"',atlas});
    const response=await GET(new Request("https://example.com/api/monitor-preview"));
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({version:2,imageDataUrl:body.imageDataUrl,atlas});
  });
  it("V2の配置と投稿数が合う場合だけ保存する", async () => {
    const atlas={columns:1,rows:1,placements:[{row:13,col:5}]};
    expect((await POST(upload({...body,version:2,atlas}))).status).toBe(204);
    expect(state.save).toHaveBeenCalledWith(jpeg,["approved"],atlas);
    state.save.mockClear();
    expect((await POST(upload({...body,version:2,atlas:{...atlas,placements:[]}}))).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "preview-test");
    state.get.mockResolvedValue({ buffer: jpeg, updatedAt: Date.now(), etag: '"preview"' });
    state.save.mockResolvedValue(true);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("公開終了後は取得・更新ともFirebaseを呼ばず410を返す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:59:00+09:00"));
    for (const response of [await GET(new Request("https://example.com/api/monitor-preview")), await POST(upload())]) {
      expect(response.status).toBe(410);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(state.get).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("期限前に受け付けても取得中に期限を過ぎた画像は配信しない", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:58:59+09:00"));
    state.get.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-11-01T23:59:00+09:00"));
      return { buffer: jpeg, updatedAt: Date.now(), etag: '"preview"' };
    });
    expect((await GET(new Request("https://example.com/api/monitor-preview"))).status).toBe(410);
  });

  it("共有キャッシュが公開終了日時を越えない", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:58:59+09:00"));
    state.get.mockResolvedValue({ buffer: jpeg, updatedAt: Date.now(), etag: '"preview"' });
    expect((await GET(new Request("https://example.com/api/monitor-preview"))).headers.get("Cache-Control")).toContain("s-maxage=1,");
  });

  it("参加者には画像だけを公開し、全体画像を共有キャッシュできる", async () => {
    const response = await GET(new Request("https://example.com/api/monitor-preview"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=10");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(jpeg);
    expect(response.headers.get("X-Monitor-Updated-At")).toBeTruthy();
  });

  it("変更がない画像の本文を再送しない", async () => {
    const response = await GET(new Request("https://example.com/api/monitor-preview", { headers: { "If-None-Match": '"preview"' } }));
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("クエリでキャッシュを回避する取得はBlobを呼ぶ前に拒否する", async () => {
    expect((await GET(new Request("https://example.com/api/monitor-preview?random=1"))).status).toBe(400);
    expect(state.get).not.toHaveBeenCalled();
  });

  it("総量上限では運営端末の更新停止を通知する", async () => {
    state.save.mockRejectedValue(new MonitorPreviewBudgetError("limit"));
    const response = await POST(upload());
    expect(response.status).toBe(429);
    expect(response.headers.get("X-Monitor-Publishing-Stopped")).toBe("true");
  });

  it("成否不明の書き込みは再試行できる409を返す", async () => {
    state.save.mockRejectedValue(new MonitorPreviewBudgetError("pending"));
    const response = await POST(upload());
    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("90");
  });

  it("共有キャッシュの有効期間が画像の90秒期限を超えない", async () => {
    state.get.mockResolvedValue({ buffer: jpeg, updatedAt: Date.now() - 89_000, etag: '"old"' });
    const response = await GET(new Request("https://example.com/api/monitor-preview"));
    expect(response.headers.get("Cache-Control")).toMatch(/s-maxage=[01],/);
  });

  it("未生成・期限切れ・非表示による失効をキャッシュしない", async () => {
    state.get.mockResolvedValue(null);
    const response = await GET(new Request("https://example.com/api/monitor-preview"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("認証なしの画像更新ではStorageに触れない", async () => {
    const response = await POST(new Request("https://example.com/api/monitor-preview", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("運営の認証後にだけ更新できる", async () => {
    expect((await POST(upload())).status).toBe(204);
    expect(state.save).toHaveBeenCalledWith(jpeg, ["approved"]);
  });

  it("非表示作品を含むアップロードを拒否する", async () => {
    state.save.mockResolvedValue(false);
    expect((await POST(upload())).status).toBe(409);
  });

  it("200KBを超える画像、JPEG以外、不正な作品IDを拒否する", async () => {
    for (const value of [
      { ...body, imageDataUrl: `data:image/jpeg;base64,${Buffer.alloc(200_001).toString("base64")}` },
      { ...body, imageDataUrl: "data:image/jpeg;base64,PHN2Zz4=" },
      { ...body, submissionIds: ["../private"] },
      { ...body, submissionIds: Array.from({ length: 279 }, () => "approved") },
    ]) expect((await POST(upload(value))).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("公開側で障害が起きても古い画像を返さない", async () => {
    state.get.mockRejectedValue(new Error("offline"));
    const response = await GET(new Request("https://example.com/api/monitor-preview"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
