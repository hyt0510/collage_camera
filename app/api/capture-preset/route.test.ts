import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ guard: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api-protection", () => ({ protectParticipantRequest: state.guard }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/operation-lock", () => ({ OperationBusyError: class extends Error {}, withOperationLock: vi.fn() }));
vi.mock("@/lib/capture-preset-store", () => ({ getActiveCapturePreset: state.get, listCapturePresets: () => [], setActiveCapturePreset: vi.fn() }));
import { GET } from "@/app/api/capture-preset/route";
beforeEach(() => { vi.resetAllMocks(); state.guard.mockResolvedValue(null); state.get.mockResolvedValue({ id: "preset" }); });
describe("公開プリセットの受付制限", () => {
  it("クエリでCDNキャッシュを増殖させようとしてもFirebaseへ進まない", async () => {
    expect((await GET(new Request("https://example.invalid/api/capture-preset?random=1"))).status).toBe(400);
    expect(state.guard).not.toHaveBeenCalled(); expect(state.get).not.toHaveBeenCalled();
  });
  it.each([429, 503, 410])("受付が%dならFirestore設定取得へ進まない", async status => {
    state.guard.mockResolvedValue(new Response(null, { status }));
    expect((await GET(new Request("https://example.invalid/api/capture-preset"))).status).toBe(status);
    expect(state.get).not.toHaveBeenCalled();
  });
  it("受付後だけ設定を読み、CDNで10秒共有する", async () => {
    const response = await GET(new Request("https://example.invalid/api/capture-preset"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("s-maxage=10");
    expect(state.get).toHaveBeenCalledOnce();
  });
});
