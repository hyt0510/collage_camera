import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ manifest: undefined as Record<string, unknown> | undefined, reads: [] as string[], originals: [] as unknown[] }));
vi.mock("@/lib/firebase-admin", () => ({ db: {
  collection: () => ({
    doc: () => ({ kind: "manifest" }),
    where: () => ({ orderBy: () => ({ limit: () => ({ kind: "query" }) }) }),
  }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    get: async (ref: { kind: string }) => {
      state.reads.push(ref.kind);
      return ref.kind === "query" ? { docs: state.originals.map(value => ({ data: () => value })) }
        : { exists: !!state.manifest, get: (key: string) => state.manifest?.[key] };
    },
    set: (_ref: unknown, value: Record<string, unknown>) => { state.manifest = value; },
  }),
} }));
const { readMonitorManifest, writeMonitorManifest } = await import("./monitor-manifest");
import type { Submission } from "@/lib/submission-store";
const photo = (id: string) => ({ id, createdAt: id, status: "approved", placement: { row: 13, col: 5, label: "A" }, collageImageUrl: `https://storage.googleapis.com/test/submissions/${id}.jpg`, items: [], userId: "private-user", templateId: "a" }) as Submission;
beforeEach(() => { state.manifest = undefined; state.originals = []; state.reads = []; });
describe("モニター用の集約ドキュメント", () => {
  it("移行時だけ既存一覧を読み、その後は毎回1ドキュメントで取得する", async () => {
    state.originals = [photo("old")];
    expect((await readMonitorManifest()).map(value => value.id)).toEqual(["old"]);
    state.reads = [];
    await readMonitorManifest(); await readMonitorManifest();
    expect(state.reads).toEqual(["manifest", "manifest"]);
    expect(JSON.stringify(state.manifest)).not.toContain("private-user");
  });
  it("承認と非表示の変更を渡されたトランザクションに含める", async () => {
    await readMonitorManifest();
    const tx = { get: async (ref: { kind: string }) => ref.kind === "query" ? { docs: [] } : ({ exists: true, get: (key: string) => state.manifest?.[key] }), set: vi.fn((_ref, value) => { state.manifest = value; }) };
    await writeMonitorManifest(tx as never, photo("new"), "approved");
    expect((await readMonitorManifest()).map(value => value.id)).toEqual(["new"]);
    await writeMonitorManifest(tx as never, photo("new"), "hidden_manual");
    expect(await readMonitorManifest()).toEqual([]);
    expect(tx.set).toHaveBeenCalledTimes(2);
  });

  it("旧デプロイが更新番号だけを書いた場合は承認一覧を再構築する", async () => {
    state.originals = [photo("old")];
    await readMonitorManifest();
    state.manifest = { version: "old-deployment-change" };
    state.originals = [];
    expect(await readMonitorManifest()).toEqual([]);
    expect(state.manifest?.version).toBe("old-deployment-change");
  });

  it("最新500件から非表示にしたとき、上限外の承認作品を補充する", async () => {
    const originals = Array.from({ length: 501 }, (_, index) => photo(String(index).padStart(4, "0")));
    state.originals = originals;
    expect(await readMonitorManifest()).toHaveLength(500);
    const tx = { get: async (ref: { kind: string }) => ref.kind === "query"
      ? { docs: originals.map(value => ({ data: () => value })) }
      : { exists: true, get: (key: string) => state.manifest?.[key] },
      set: (_ref: unknown, value: Record<string, unknown>) => { state.manifest = value; } };
    await writeMonitorManifest(tx as never, photo("0500"), "hidden_manual");
    const result = await readMonitorManifest();
    expect(result).toHaveLength(500);
    expect(result.some(value => value.id === "0500")).toBe(false);
    expect(result.some(value => value.id === "0000")).toBe(true);
  });

  it("大きな旧画像メタデータでもFirestoreの1MiB上限を超えない", async () => {
    state.originals = Array.from({ length: 500 }, (_, index) => ({ ...photo(String(index)), collageImageUrl: "x".repeat(4000) }));
    const result = await readMonitorManifest();
    expect(result.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(state.manifest))).toBeLessThan(701_000);
  });
});
