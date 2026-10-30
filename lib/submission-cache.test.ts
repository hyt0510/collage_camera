import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const list = vi.hoisted(() => vi.fn());
const revision = vi.hoisted(() => vi.fn());
vi.mock("@/lib/submission-store", () => ({ listApprovedSubmissions: list, getSubmissionVersion: revision }));
const { getApprovedSubmissions, invalidateApprovedSubmissions } = await import("./submission-cache");

describe("承認済み投稿のキャッシュ", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    list.mockReset();
    revision.mockReset().mockResolvedValue(0);
    invalidateApprovedSubmissions();
  });

  it("営業時間外も5秒で更新番号を確認し、非表示の投稿を返し続けない", async () => {
    let now = new Date("2026-10-18T08:00:00Z").getTime();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    list.mockResolvedValueOnce([{ id: "visible" }]).mockResolvedValueOnce([]);
    expect(await getApprovedSubmissions()).toEqual([{ id: "visible" }]);
    now += 5_000;
    revision.mockResolvedValue(1);
    expect(await getApprovedSubmissions()).toEqual([]);
  });

  it("更新番号が同じなら5秒経過後も一覧を再取得しない", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    list.mockResolvedValue([{ id: "visible" }]);
    await getApprovedSubmissions();
    now = 5_000;
    expect(await getApprovedSubmissions()).toEqual([{ id: "visible" }]);
    expect(revision).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("更新番号を確認できなければ古い一覧を返さず、復旧後に確認し直す", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    list.mockResolvedValueOnce([{ id: "old" }]).mockResolvedValueOnce([]);
    await getApprovedSubmissions();
    now = 5_000;
    revision.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(1);
    await expect(getApprovedSubmissions()).rejects.toThrow("offline");
    expect(await getApprovedSubmissions()).toEqual([]);
  });

  it("同時に届いた取得をまとめる", async () => {
    list.mockResolvedValue([]);
    await Promise.all([getApprovedSubmissions(), getApprovedSubmissions()]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("無効化前に始まった取得結果をキャッシュに戻さない", async () => {
    let finish!: (value: { id: string }[]) => void;
    list.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const old = getApprovedSubmissions();
    // 更新番号の確認に続いて一覧の取得が始まるまで進める
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    invalidateApprovedSubmissions();
    finish([{ id: "hidden" }]);
    await old;
    list.mockResolvedValue([]);
    expect(await getApprovedSubmissions()).toEqual([]);
  });

  it("取得失敗時は古い画像を返さず、次の取得で回復する", async () => {
    list.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    await expect(getApprovedSubmissions()).rejects.toThrow("offline");
    expect(await getApprovedSubmissions()).toEqual([]);
  });
});
