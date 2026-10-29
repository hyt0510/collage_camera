import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Submission } from "@/lib/submission-store";

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin", () => ({ auth: () => ({ verifyIdToken: state.verifyToken }) }));
vi.mock("@/lib/api-protection", () => ({ protectParticipantRequest: vi.fn() }));
vi.mock("@/lib/participant-admission", () => ({ settleParticipantRequest: vi.fn() }));
vi.mock("@/lib/submission-request-store", () => ({ processSubmissionRequest: vi.fn(), SubmissionRequestError: class extends Error {} }));
vi.mock("@/lib/capture-preset-store", () => ({ getSubmissionCapturePreset: vi.fn() }));
vi.mock("@/lib/operation-lock", () => ({ OperationBusyError: class extends Error {}, withOperationLock: state.lock, withSubmissionActivity: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderateImage: vi.fn() }));
const state = vi.hoisted(() => ({ approved: vi.fn(), all: vi.fn(), redemptions: vi.fn(), imageUrls: vi.fn(), lock: vi.fn(), deleteAll: vi.fn(), removePreview: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/monitor-preview-store", () => ({ deleteMonitorPreview: state.removePreview }));
vi.mock("@/lib/submission-cache", () => ({ getApprovedSubmissions: state.approved, invalidateApprovedSubmissions: vi.fn() }));
vi.mock("@/lib/prize-store", () => ({ listPrizeRedemptions: state.redemptions }));
vi.mock("@/lib/submission-store", () => ({
  listAllSubmissions: state.all,
  withAdminImageUrls: state.imageUrls,
  deleteAllSubmissions: state.deleteAll,
  createSubmission: vi.fn(), SubmissionLimitError: class extends Error {},
}));
const { GET, POST, DELETE } = await import("./route");
const { protectParticipantRequest } = await import("@/lib/api-protection");
const { settleParticipantRequest } = await import("@/lib/participant-admission");
const { processSubmissionRequest } = await import("@/lib/submission-request-store");
const { withSubmissionActivity } = await import("@/lib/operation-lock");
const { getSubmissionCapturePreset } = await import("@/lib/capture-preset-store");
const { moderateImage } = await import("@/lib/moderation");
const { createSubmission } = await import("@/lib/submission-store");
const { CAPTURE_PRESETS, buildThemeMapFromPreset, findTemplateById } = await import("@/lib/collage-config");
const auth = { authorization: `Basic ${btoa("staff:test-password")}` };

describe("投稿受付予算の精算", () => {
  const preset = CAPTURE_PRESETS[0]!;
  const template = findTemplateById(preset.templateId)!;
  const themes = buildThemeMapFromPreset(template, preset);
  const validBody = {
    presetId: preset.id, templateId: template.id,
    collageDataUrl: "data:image/jpeg;base64,/9j/AA==",
    items: template.polygons.map(({ id }) => ({ polygonId: id, theme: themes[id] })),
  };
  const submission: Submission = {
    id: "saved-work", userId: "owner", templateId: template.id,
    createdAt: "2026-10-29T00:00:00Z", status: "pending_manual",
    placement: { row: 0, col: 0, label: "A" }, items: [],
  };
  function request(body: string, requestId: string | null = "request-1") {
    const headers = new Headers({ authorization: "Bearer valid-token", "Content-Type": "application/json" });
    if (requestId !== null) headers.set("Idempotency-Key", requestId);
    return new Request("https://example.com/api/submissions", { method: "POST", headers, body });
  }
  beforeEach(() => {
    vi.resetAllMocks();
    state.verifyToken.mockResolvedValue({ uid: "owner" });
    vi.mocked(protectParticipantRequest).mockResolvedValue(null);
    vi.mocked(withSubmissionActivity).mockImplementation(run => run());
    vi.mocked(getSubmissionCapturePreset).mockResolvedValue(null);
    vi.mocked(processSubmissionRequest).mockResolvedValue(submission);
  });

  it.each([
    ["壊れたJSON", "{", "request-1"],
    ["不正な投稿内容", "{}", "request-1"],
    ["再送IDの欠落", JSON.stringify(validBody), null],
    ["不正な再送ID", JSON.stringify(validBody), "invalid/id"],
  ])("%sは投稿処理に進まず、DB予算を消費しない", async (_name, body, requestId) => {
    const incoming = request(body, requestId);
    expect((await POST(incoming)).status).toBe(400);
    expect(protectParticipantRequest).not.toHaveBeenCalled();
    expect(processSubmissionRequest).not.toHaveBeenCalled();
    expect(settleParticipantRequest).not.toHaveBeenCalled();
  });

  it("保存済み投稿の再送は検閲・保存の予算を消費しない", async () => {
    const incoming = request(JSON.stringify(validBody));
    const response = await POST(incoming);
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("saved-work");
    expect(moderateImage).not.toHaveBeenCalled();
    expect(createSubmission).not.toHaveBeenCalled();
    expect(settleParticipantRequest).toHaveBeenCalledWith(incoming, { reads: 6, writes: 2 });
  });

  it("新規投稿は保存処理の予算を維持する", async () => {
    vi.mocked(getSubmissionCapturePreset).mockResolvedValue({ id: preset.id } as NonNullable<Awaited<ReturnType<typeof getSubmissionCapturePreset>>>);
    vi.mocked(moderateImage).mockResolvedValue({ safe: null, source: "disabled", reason: "manual" });
    vi.mocked(createSubmission).mockResolvedValue(submission);
    vi.mocked(processSubmissionRequest).mockImplementation(async (_uid, _key, _fingerprint, save) => save("saved-work"));
    const incoming = request(JSON.stringify(validBody));
    expect((await POST(incoming)).status).toBe(200);
    expect(createSubmission).toHaveBeenCalledOnce();
    expect(settleParticipantRequest).toHaveBeenCalledWith(incoming, { reads: 20, writes: 12 });
  });

  it("保存に失敗したときは予算を返さない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(processSubmissionRequest).mockRejectedValue(new Error("storage timeout"));
    try {
      expect((await POST(request(JSON.stringify(validBody)))).status).toBe(500);
      expect(settleParticipantRequest).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

describe("投稿一覧API", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "test-password");
    vi.clearAllMocks();
    state.lock.mockImplementation(async (_key: string, run: () => Promise<unknown>) => run());
    state.deleteAll.mockResolvedValue(0);
    state.removePreview.mockResolvedValue(undefined);
    state.approved.mockResolvedValue([{
      id: "one", userId: "private-user", placement: { row: 0, col: 1, label: "A" },
      collageImageUrl: "https://example.com/image.webp", items: [],
      moderation: { reason: "private-moderation" },
    }]);
    state.imageUrls.mockImplementation(async (value: unknown) => value);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("公開終了後は会場モニター用一覧をDBを読まずに止める", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:59:00+09:00"));
    const response = await GET(new Request("https://example.com/api/submissions", { headers: auth }));
    expect(response.status).toBe(410);
    expect(state.approved).not.toHaveBeenCalled();
  });

  it("公開終了後も運営用一覧は認証後に確認できる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:59:00+09:00"));
    state.all.mockResolvedValue([]);
    state.redemptions.mockResolvedValue({});
    expect((await GET(new Request("https://example.com/api/submissions?scope=all", { headers: auth }))).status).toBe(200);
  });

  it("会場用一覧の取得中に期限を越えた場合も410を返す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:58:59+09:00"));
    state.approved.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-11-01T23:59:00+09:00"));
      return [];
    });
    expect((await GET(new Request("https://example.com/api/submissions", { headers: auth }))).status).toBe(410);
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

  it("モニターにもStorageのURLではなく認証付き画像URLを返す", async () => {
    state.imageUrls.mockResolvedValue([{
      id: "one", placement: { row: 0, col: 1, label: "A" },
      collageImageUrl: "/api/submissions/one/image", items: [],
    }]);
    const response = await GET(new Request("https://example.com/api/submissions", { headers: auth }));
    expect(state.imageUrls).toHaveBeenCalledWith(await state.approved.mock.results[0].value);
    const payload = await response.json();
    expect(payload.submissions[0].collageImageUrl).toBe("/api/submissions/one/image");
    expect(JSON.stringify(payload)).not.toContain("https://example.com/image.webp");
  });
});

describe("投稿の一括削除API", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "test-password");
    vi.clearAllMocks();
    state.lock.mockImplementation(async (_key: string, run: () => Promise<unknown>) => run());
    state.deleteAll.mockResolvedValue(0);
    state.removePreview.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("投稿が0件でも保存済みの全体プレビューを削除する", async () => {
    const response = await DELETE(new Request("https://example.com/api/submissions", { method: "DELETE", headers: auth }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, count: 0 });
    expect(state.deleteAll).toHaveBeenCalledOnce();
    expect(state.removePreview).toHaveBeenCalledOnce();
  });

  it("画像削除が失敗したら成功を返さず、再操作で削除できる", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.removePreview.mockRejectedValueOnce(new Error("delete failed"));
      const request = () => new Request("https://example.com/api/submissions", { method: "DELETE", headers: auth });
      expect((await DELETE(request())).status).toBe(500);
      expect((await DELETE(request())).status).toBe(200);
      expect(state.removePreview).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("認証なしでは投稿も全体プレビューも削除しない", async () => {
    const response = await DELETE(new Request("https://example.com/api/submissions", { method: "DELETE" }));
    expect(response.status).toBe(401);
    expect(state.deleteAll).not.toHaveBeenCalled();
    expect(state.removePreview).not.toHaveBeenCalled();
  });
});
