import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/services/api/request";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("通信の待ち時間の上限", () => {
  it("応答本文が来ない場合も時間切れにする", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url, options: RequestInit) => ({
      ok: true,
      json: () => new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")))),
    })));
    const pending = fetchJson("/api/test", {}, 1_000);
    const failure = expect(pending).rejects.toThrow("通信");
    await vi.advanceTimersByTimeAsync(1_000);
    await failure;
  });

  it("正常なJSONとHTTP応答を返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":true}')));
    const { payload, response } = await fetchJson<{ ok: boolean }>("/api/test");
    expect(payload?.ok).toBe(true);
    expect(response.ok).toBe(true);
  });
});
