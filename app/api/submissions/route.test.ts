import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildThemeMapFromPreset, findTemplateById, getPresetById } from "@/lib/collage-config";

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin", () => ({ auth: () => ({ verifyIdToken: async () => ({ uid: "user" }) }) }));
vi.mock("@/lib/api-protection", () => ({ protectParticipantRequest: async () => null }));
vi.mock("@/lib/submission-request-store", () => ({
  processSubmissionRequest: async (_uid: string, _request: string, _hash: string, save: (id: string) => Promise<unknown>) => save("submission"),
  SubmissionRequestError: class extends Error {},
}));
vi.mock("@/lib/capture-preset-store", () => ({ getSubmissionCapturePreset: async () => ({ id: "pre-festival-home" }) }));
vi.mock("@/lib/operation-lock", () => ({ OperationBusyError: class extends Error {}, withOperationLock: vi.fn(), withSubmissionActivity: async (save: () => Promise<unknown>) => save() }));
vi.mock("@/lib/moderation", () => ({ moderateImage: async () => ({ safe: true, source: "cloud-vision", reason: "test" }) }));
const state = vi.hoisted(() => ({ approved: vi.fn(), all: vi.fn(), redemptions: vi.fn() }));
vi.mock("@/lib/submission-cache", () => ({ getApprovedSubmissions: state.approved, invalidateApprovedSubmissions: vi.fn() }));
vi.mock("@/lib/prize-store", () => ({ listPrizeRedemptions: state.redemptions }));
vi.mock("@/lib/submission-store", () => ({
  listAllSubmissions: state.all,
  withAdminImageUrls: async (value: unknown) => value,
  createSubmission: async () => ({ id: "submission", placement: { label: "A" }, status: "approved" }),
  SubmissionLimitError: class extends Error {},
}));
const { GET, POST } = await import("./route");
const auth = { authorization: `Basic ${btoa("staff:test-password")}` };

describe("投稿一覧API", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "test-password");
    vi.clearAllMocks();
    state.approved.mockResolvedValue([{
      id: "one", userId: "private-user", placement: { row: 0, col: 1, label: "A" },
      collageImageUrl: "https://example.com/image.webp", items: [],
      moderation: { reason: "private-moderation" },
    }]);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it.each(["00:00:00", "08:59:59", "12:00:00", "17:00:00"])("日本時間%sの参加者投稿もBasic認証なしで受け付ける", async (time) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`2026-10-31T${time}+09:00`));
    const preset = getPresetById("pre-festival-home")!;
    const template = findTemplateById(preset.templateId)!;
    const themes = buildThemeMapFromPreset(template, preset);
    const response = await POST(new Request("https://example.com/api/submissions", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Idempotency-Key": "request-id" },
      body: JSON.stringify({
        templateId: template.id, presetId: preset.id,
        collageDataUrl: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64")}`,
        items: template.polygons.map((polygon) => ({ polygonId: polygon.id, theme: themes[polygon.id], dataUrl: "" })),
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "submission", status: "approved" });
  });

  it("一覧の直接取得も認証なしではDBを読まずに拒否する", async () => {
    for (const suffix of ["", "?scope=all"]) {
      const response = await GET(new Request(`https://example.com/api/submissions${suffix}`));
      expect(response.status).toBe(401);
    }
    expect(state.approved).not.toHaveBeenCalled();
    expect(state.all).not.toHaveBeenCalled();
  });

  it("認証後のモニター用一覧にUIDや検閲情報を含めない", async () => {
    const response = await GET(new Request("https://example.com/api/submissions", { headers: auth }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissions: [{
      id: "one", placement: { row: 0, col: 1, label: "A" },
      collageImageUrl: "https://example.com/image.webp", items: [],
    }] });
    expect(response.headers.get("Cache-Control")).toContain("private");
  });

  it("前回と同じ一覧には304を返し、変更後は新しい本文を返す", async () => {
    const url = "https://example.com/api/submissions";
    const first = await GET(new Request(url, { headers: auth }));
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();
    const headers = { ...auth, "If-None-Match": etag! };
    const unchanged = await GET(new Request(url, { headers }));
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
    state.approved.mockResolvedValue([]);
    const changed = await GET(new Request(url, { headers }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ submissions: [] });
    expect(changed.headers.get("ETag")).not.toBe(etag);
  });
});
