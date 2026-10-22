import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin", () => ({ auth: () => ({ verifyIdToken: async () => ({ uid: "user" }) }) }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: () => null }));
vi.mock("@/lib/moderation", () => ({ moderateImage: async () => ({ safe: true, source: "disabled", reason: "test" }) }));
vi.mock("@/lib/prize-store", () => ({ listPrizeRedemptions: async () => ({}) }));
vi.mock("@/lib/submission-validation", () => ({
  parseSubmissionBody: () => ({ presetId: "pre-festival-home", templateId: "shards-6-v2", collage: { buffer: Buffer.from("test") }, items: [] }),
}));
vi.mock("@/lib/submission-store", () => ({
  reserveSubmissionQuota: vi.fn(async () => {}),
  releaseSubmissionQuota: vi.fn(),
  createSubmission: async () => ({ id: "submission", placement: { label: "A" }, status: "approved" }),
  listApprovedSubmissions: vi.fn(async () => []),
  listAllSubmissions: vi.fn(),
  withAdminImageUrls: vi.fn(),
  SubmissionLimitError: class extends Error {},
}));

const { POST, GET } = await import("./route");
const { reserveSubmissionQuota, listApprovedSubmissions } = await import("@/lib/submission-store");

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe("受付時間の制限解除", () => {
  it.each(["00:00:00", "08:59:59", "12:00:00", "17:00:00"])("日本時間%sにも投稿できる", async (time) => {
    vi.setSystemTime(new Date(`2026-10-22T${time}+09:00`));
    const response = await POST(new Request("http://localhost/api/submissions", {
      method: "POST", headers: { Authorization: "Bearer test" }, body: "{}",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "submission", status: "approved" });
    expect(reserveSubmissionQuota).toHaveBeenCalledWith("user", "pre-festival-home");
  });

  it("時間外もキャッシュ期限後に投稿一覧を更新する", async () => {
    vi.setSystemTime(new Date("2026-10-22T18:00:00+09:00"));
    await GET(new Request("http://localhost/api/submissions"));
    vi.advanceTimersByTime(30_001);
    await GET(new Request("http://localhost/api/submissions"));
    expect(listApprovedSubmissions).toHaveBeenCalledTimes(2);
  });
});
