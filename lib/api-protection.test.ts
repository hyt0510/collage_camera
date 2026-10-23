import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), verify: vi.fn(), failed: false }));
vi.mock("@/lib/firebase-admin", () => ({ db: {
  collection: () => ({ doc: (key: string) => ({ key }) }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    get: async (ref: { key: string }) => {
      if (state.failed) throw new Error("DB offline");
      return { get: (field: string) => state.docs.get(ref.key)?.[field] };
    },
    set: (ref: { key: string }, data: Record<string, unknown>) => state.docs.set(ref.key, data),
  }),
} }));
vi.mock("firebase-admin/app-check", () => ({ getAppCheck: () => ({ verifyToken: state.verify }) }));
const { protectParticipantRequest } = await import("./api-protection");
beforeEach(() => { state.docs.clear(); state.verify.mockReset(); state.failed = false; });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("同じUIDの過剰なアクセスを429で止め、次の分に回復する", async () => {
  let now = 60_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubEnv("APP_CHECK_ENFORCED", "false");
  const request = new Request("https://example.invalid");
  for (let i = 0; i < 30; i++) expect(await protectParticipantRequest(request, "user", "prize")).toBeNull();
  expect((await protectParticipantRequest(request, "user", "prize"))?.status).toBe(429);
  now += 60_000;
  expect(await protectParticipantRequest(request, "user", "prize")).toBeNull();
});

it("App Check必須時は欠落・不正トークンを拒否する", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "true");
  expect((await protectParticipantRequest(new Request("https://example.invalid"), "user", "prize"))?.status).toBe(401);
  state.verify.mockRejectedValue(new Error("invalid"));
  const request = new Request("https://example.invalid", { headers: { "X-Firebase-AppCheck": "invalid" } });
  expect((await protectParticipantRequest(request, "user", "prize"))?.status).toBe(401);
});

it("検証済みApp Checkを受け付け、制限DB障害時は受付を止める", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "true");
  state.verify.mockResolvedValue({});
  const request = new Request("https://example.invalid", { headers: { "X-Firebase-AppCheck": "valid" } });
  expect(await protectParticipantRequest(request, "user", "submissions")).toBeNull();
  expect(state.verify).toHaveBeenCalledWith("valid");
  state.failed = true;
  expect((await protectParticipantRequest(request, "user", "submissions"))?.status).toBe(503);
});

it("UIDを作り直しても全体上限は超えられない", async () => {
  vi.stubEnv("APP_CHECK_ENFORCED", "false");
  state.docs.set("submissions", { window: Math.floor(Date.now() / 60_000), count: 1_200 });
  expect((await protectParticipantRequest(new Request("https://example.invalid"), "another-user", "submissions"))?.status).toBe(429);
});
