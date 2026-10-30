import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ADMISSION_SCRIPT, reserveParticipantRequest, settleParticipantRequest } from "@/lib/participant-admission";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  vi.stubEnv("PARTICIPANT_REDIS_READY", "true");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset().mockImplementation(async () => Response.json({ result: 1 }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("参加者APIの共有受付予算", () => {
  it("UIDをハッシュ化し、全環境共通の予算を1回のLuaで予約する", async () => {
    const request = new Request("https://example.invalid", { method: "POST" });
    expect(await reserveParticipantRequest(request, "private-uid", "submissions")).toBe("accepted");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.slice(0, 3)).toEqual(["EVAL", ADMISSION_SCRIPT, 3]);
    expect(JSON.stringify(body)).not.toContain("private-uid");
    expect(body[5]).toBe("collage:2026:participant:budget");
    expect(body.slice(7, 11)).toEqual([20, 14, 30, "submissions"]);
  });
  it.each([[0, "limited"], [2, "closed"]])("Redisの判定%dを受け取る", async (result, expected) => {
    fetchMock.mockResolvedValueOnce(Response.json({ result }));
    expect(await reserveParticipantRequest(new Request("https://example.invalid"), "uid", "prize")).toBe(expected);
  });
  it("未設定・未ClaimのDBを参加者の処理に使わない", async () => {
    vi.stubEnv("PARTICIPANT_REDIS_READY", "false");
    await expect(reserveParticipantRequest(new Request("https://example.invalid"), "uid", "prize")).rejects.toThrow("未設定");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http://example.upstash.io", "https://untrusted.example", "https://example.upstash.io/?token=secret"])("許可していない接続先へ認証情報を送らない（%s）", async endpoint => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", endpoint);
    await expect(reserveParticipantRequest(new Request("https://example.invalid"), "uid", "prize")).rejects.toThrow("接続先");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([Response.json({ error: "quota exceeded" }), Response.json({ result: "1" }), new Response(null, { status: 429 })])("上限・不正応答時に成功扱いしない", async response => {
    fetchMock.mockResolvedValueOnce(response);
    await expect(reserveParticipantRequest(new Request("https://example.invalid"), "uid", "prize")).rejects.toThrow();
  });
  it("成功後だけ未使用枠を精算し、精算を繰り返さない", async () => {
    const request = new Request("https://example.invalid");
    await reserveParticipantRequest(request, "uid", "prize");
    await settleParticipantRequest(request, { reads: 2, writes: 0 });
    await settleParticipantRequest(request, { reads: 2, writes: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("精算の通信失敗は再送せず、受付枠を返さない方向に倒す", async () => {
    const request = new Request("https://example.invalid");
    await reserveParticipantRequest(request, "uid", "prize");
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(settleParticipantRequest(request, { reads: 2, writes: 0 })).resolves.toBeUndefined();
    await settleParticipantRequest(request, { reads: 2, writes: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
