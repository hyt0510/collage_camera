import { describe, expect, it, vi } from "vitest";
import { createCameraSession, getPinchZoom, getCameraSourceRect, watchCameraOrientation } from "@/lib/utils/camera";

describe("カメラの向きの更新", () => {
  it("重複する向き変更をまとめ、終了後には再起動しない", () => {
    const orientation = new EventTarget();
    const target = new EventTarget();
    Object.assign(target, { screen: { orientation } });
    vi.stubGlobal("window", target);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    try {
      const restart = vi.fn();
      const stop = watchCameraOrientation(restart);
      orientation.dispatchEvent(new Event("change"));
      target.dispatchEvent(new Event("orientationchange"));
      expect(frames).toHaveLength(1);
      frames[0](0);
      expect(restart).toHaveBeenCalledOnce();
      target.dispatchEvent(new Event("resize"));
      expect(frames).toHaveLength(1);
      target.dispatchEvent(new Event("orientationchange"));
      stop();
      expect(cancel).toHaveBeenCalledOnce();
      frames[1](0);
      orientation.dispatchEvent(new Event("change"));
      expect(restart).toHaveBeenCalledOnce();
      expect(frames).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("カメラのピンチズーム", () => {
  it("指の距離の比率で拡大し、続けて縮小できる", () => {
    expect(getPinchZoom(1, 100, 200)).toBe(2);
    expect(getPinchZoom(3, 200, 100)).toBe(1.5);
  });

  it("等倍未満や過度な拡大を防ぐ", () => {
    expect(getPinchZoom(1, 100, 10)).toBe(1);
    expect(getPinchZoom(3, 100, 1000)).toBe(4);
    expect(getPinchZoom(2, 0, 100)).toBe(2);
  });

  it("撮影時にも中央を同じ倍率で切り出す", () => {
    expect(getCameraSourceRect(1920, 1080, 2)).toEqual({
      sx: 480, sy: 270, sw: 960, sh: 540,
    });
    expect(getCameraSourceRect(1080, 1920, 1)).toEqual({
      sx: 0, sy: 0, sw: 1080, sh: 1920,
    });
  });
});

function media() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

describe("カメラの起動と終了", () => {
  it("閉じた後に届いたストリームを停止する", async () => {
    const session = createCameraSession();
    let finish!: (stream: MediaStream) => void;
    const pending = session.start(() => new Promise((resolve) => { finish = resolve; }));
    session.stop();
    const next = media();
    finish(next.stream);
    expect(await pending).toBeNull();
    expect(next.stop).toHaveBeenCalledOnce();
  });

  it("切替の応答が逆順でも最後のカメラだけを採用する", async () => {
    const session = createCameraSession();
    let finish!: (stream: MediaStream) => void;
    const first = session.start(() => new Promise((resolve) => { finish = resolve; }));
    const older = media();
    const latest = media();
    expect(await session.start(async () => latest.stream)).toBe(latest.stream);
    finish(older.stream);
    expect(await first).toBeNull();
    expect(older.stop).toHaveBeenCalledOnce();
    expect(latest.stop).not.toHaveBeenCalled();
    session.stop();
    expect(latest.stop).toHaveBeenCalledOnce();
  });

  it("古いカメラの起動失敗で新しい画面をエラーにしない", async () => {
    const session = createCameraSession();
    let reject!: (reason: Error) => void;
    const first = session.start(() => new Promise((_, fail) => { reject = fail; }));
    const latest = media();
    await session.start(async () => latest.stream);
    reject(new Error("old camera failed"));
    expect(await first).toBeNull();
  });

  it("現在の起動失敗は通知し、再起動できる", async () => {
    const session = createCameraSession();
    await expect(session.start(async () => { throw new Error("denied"); })).rejects.toThrow("denied");
    const next = media();
    expect(await session.start(async () => next.stream)).toBe(next.stream);
  });
});
