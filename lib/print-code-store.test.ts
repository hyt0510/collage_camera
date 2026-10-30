import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), serial: Promise.resolve() as Promise<unknown>, random: [] as number[] }));
vi.mock("node:crypto", () => ({ randomInt: () => state.random.shift() ?? 0 }));
vi.mock("@/lib/firebase-admin", () => {
  const snapshot = (key: string) => ({ exists: state.docs.has(key), get: (field: string) => state.docs.get(key)?.[field] });
  return { db: {
    collection: (name: string) => ({ doc: (id: string) => ({ key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }) }),
    runTransaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = state.serial.catch(() => {}).then(async () => {
        const writes: Array<() => void> = [];
        const value = await run({
          get: async (ref: { key: string }) => snapshot(ref.key),
          set: (ref: { key: string }, data: Record<string, unknown>) => writes.push(() => state.docs.set(ref.key, data)),
        });
        writes.forEach(write => write());
        return value;
      });
      state.serial = result;
      return result;
    },
  } };
});
import { getOrCreatePrintCode, resolvePrintCode } from "@/lib/print-code-store";

beforeEach(() => { state.docs.clear(); state.serial = Promise.resolve(); state.random = []; state.docs.set("submissions/work-1", { userId: "owner" }); });

describe("印刷受付番号の発行", () => {
  it("自分の既存作品に番号を発行し、長いIDへ引き直せる", async () => {
    const code = await getOrCreatePrintCode("work-1", "owner");
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(await resolvePrintCode(code)).toBe("work-1");
  });
  it("再取得・同時取得で番号を変えない", async () => {
    const codes = await Promise.all([getOrCreatePrintCode("work-1", "owner"), getOrCreatePrintCode("work-1", "owner")]);
    expect(codes[0]).toBe(codes[1]);
    expect(state.docs.size).toBe(3);
  });
  it("他作品と衝突した番号を上書きせず別の番号を発行する", async () => {
    state.docs.set("print_codes/222222", { submissionId: "other-work" });
    state.random = [...Array(6).fill(0), ...Array(6).fill(1)];
    expect(await getOrCreatePrintCode("work-1", "owner")).toBe("333333");
    expect(await resolvePrintCode("222222")).toBe("other-work");
  });
  it("他人の作品・存在しない作品には番号を発行しない", async () => {
    await expect(getOrCreatePrintCode("work-1", "other")).rejects.toMatchObject({ status: 404 });
    await expect(getOrCreatePrintCode("missing", "owner")).rejects.toMatchObject({ status: 404 });
    expect(state.docs.size).toBe(1);
  });
  it("発行済みでも所有者を確認する", async () => {
    await getOrCreatePrintCode("work-1", "owner");
    await expect(getOrCreatePrintCode("work-1", "other")).rejects.toMatchObject({ status: 404 });
  });
  it("小文字・区切り入り番号は同じ作品へ、未登録番号はnullになる", async () => {
    state.docs.set("print_codes/K7M4PX", { submissionId: "work-1" });
    expect(await resolvePrintCode("k7m-4px")).toBe("work-1");
    expect(await resolvePrintCode("AAAAAA")).toBeNull();
    expect(await resolvePrintCode("../bad")).toBeNull();
  });
});
