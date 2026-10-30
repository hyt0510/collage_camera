import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock("firebase-admin", () => ({ auth: () => auth }));
vi.mock("@/lib/api-protection", () => ({ protectParticipantRequest: vi.fn() }));
vi.mock("@/lib/print-code-store", () => ({ getOrCreatePrintCode: vi.fn(), PrintCodeError: class extends Error { constructor(public status: number) { super(); } } }));
import { protectParticipantRequest } from "@/lib/api-protection";
import { getOrCreatePrintCode, PrintCodeError } from "@/lib/print-code-store";
import { POST } from "./route";
const call = (id = "work-1", auth: string | null = "Bearer token") => POST(new Request("https://example.com/api/submissions/work-1/print-code", { method: "POST", headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.resetAllMocks(); auth.verifyIdToken.mockResolvedValue({ uid: "owner" }); vi.mocked(protectParticipantRequest).mockResolvedValue(null); vi.mocked(getOrCreatePrintCode).mockResolvedValue("K7M4PX"); });
describe("参加者の印刷受付番号", () => {
  it("認証した所有者の番号を取得し、キャッシュさせない", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "K7M4PX" });
    expect(getOrCreatePrintCode).toHaveBeenCalledWith("work-1", "owner", expect.any(Function));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([null, "Basic abc"])("認証なし・Basic認証では番号を発行しない", async auth => {
    expect((await call("work-1", auth)).status).toBe(401);
    expect(getOrCreatePrintCode).not.toHaveBeenCalled();
  });
  it("無効トークンを拒否する", async () => {
    auth.verifyIdToken.mockRejectedValue(new Error("bad token"));
    expect((await call()).status).toBe(401);
    expect(getOrCreatePrintCode).not.toHaveBeenCalled();
  });
  it("他人の作品の存在や番号を返さない", async () => {
    vi.mocked(getOrCreatePrintCode).mockRejectedValue(new PrintCodeError(404));
    expect((await call()).status).toBe(404);
  });
  it("回数制限で拒否されたら発行しない", async () => {
    vi.mocked(protectParticipantRequest).mockResolvedValue(new Response(null, { status: 429 }) as Awaited<ReturnType<typeof protectParticipantRequest>>);
    expect((await call()).status).toBe(429);
    expect(getOrCreatePrintCode).not.toHaveBeenCalled();
  });
  it("不正なIDを拒否する", async () => {
    expect((await call("bad.id")).status).toBe(404);
    expect(getOrCreatePrintCode).not.toHaveBeenCalled();
  });
  it("障害の詳細を外へ返さない", async () => {
    vi.mocked(getOrCreatePrintCode).mockRejectedValue(new Error("private detail"));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private detail");
  });
});
