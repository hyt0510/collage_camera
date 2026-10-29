import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const reserve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vision-budget", () => ({ reserveVisionRequest: reserve }));
import { moderateImage } from "@/lib/moderation";
const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv("GOOGLE_CLOUD_VISION_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); reserve.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("検閲の予算制限", () => {
  it("上限・未設定ならVisionへ送らず手動確認に回す", async () => {
    reserve.mockResolvedValue(false);
    expect((await moderateImage(Buffer.from("photo"))).safe).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("予算確認が失敗してもVisionへ送らない", async () => {
    reserve.mockRejectedValue(new Error("offline"));
    expect((await moderateImage(Buffer.from("photo"))).safe).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("予約成功時だけ1回検閲し、失敗時に再送しない", async () => {
    reserve.mockResolvedValue(true);
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    expect((await moderateImage(Buffer.from("photo"))).safe).toBeNull();
    expect(reserve).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
