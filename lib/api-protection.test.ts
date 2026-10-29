import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const admission = vi.hoisted(() => vi.fn());
vi.mock("@/lib/participant-admission", () => ({ reserveParticipantRequest: admission }));
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), verify: vi.fn(), failed: false, firebase: vi.fn() }));
vi.mock("@/lib/firebase-admin", () => ({ db: {
  collection: () => ({ doc: (key: string) => ({ key }) }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => { state.firebase(); return fn({
    get: async (ref: { key: string }) => {
      if (state.failed) throw new Error("DB offline");
      return { get: (field: string) => state.docs.get(ref.key)?.[field] };
    },
    set: (ref: { key: string }, data: Record<string, unknown>) => state.docs.set(ref.key, data),
  }); },
} }));
vi.mock("firebase-admin/app-check", () => ({ getAppCheck: () => ({ verifyToken: state.verify }) }));
const { protectParticipantRequest } = await import("./api-protection");
beforeEach(() => { state.docs.clear(); state.verify.mockReset(); state.failed = false; state.firebase.mockClear(); admission.mockReset().mockResolvedValue("accepted"); vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T10:00:00+09:00")); });
afterEach(() => { expect(state.firebase).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("Redisが拒否したアクセスは429で止める", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "false");
  const request = new Request("https://example.invalid");
  expect(await protectParticipantRequest(request, "user", "prize")).toBeNull();
  admission.mockResolvedValueOnce("limited");
  expect((await protectParticipantRequest(request, "user", "prize"))?.status).toBe(429);
  expect(await protectParticipantRequest(request, "user", "prize")).toBeNull();
});

it("App Check必須時は欠落・不正トークンを拒否する", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "true");
  expect((await protectParticipantRequest(new Request("https://example.invalid"), "user", "prize"))?.status).toBe(401);
  state.verify.mockRejectedValue(new Error("invalid"));
  const request = new Request("https://example.invalid", { headers: { "X-Firebase-AppCheck": "invalid" } });
  expect((await protectParticipantRequest(request, "user", "prize"))?.status).toBe(401);
});

it("検証済みApp Checkを受け付け、Redis障害時は受付を止める", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "true");
  state.verify.mockResolvedValue({});
  const request = new Request("https://example.invalid", { headers: { "X-Firebase-AppCheck": "valid" } });
  expect(await protectParticipantRequest(request, "user", "submissions")).toBeNull();
  expect(state.verify).toHaveBeenCalledWith("valid");
  admission.mockRejectedValueOnce(new Error("Redis offline"));
  expect((await protectParticipantRequest(request, "user", "submissions"))?.status).toBe(503);
});

it("UIDを作り直しても全体上限は超えられない", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "false");
  admission.mockResolvedValue("limited");
  expect((await protectParticipantRequest(new Request("https://example.invalid"), "another-user", "submissions"))?.status).toBe(429);
});

it("終了後はRedisも呼ばず410にする", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-02T00:00:00+09:00"));
  expect((await protectParticipantRequest(new Request("https://example.invalid"), "user", "prize"))?.status).toBe(410);
  expect(admission).not.toHaveBeenCalled();
});
