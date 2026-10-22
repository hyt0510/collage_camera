import { describe, expect, it, vi } from "vitest";
import { createCameraSession, getPinchZoom, getCameraSourceRect, watchCameraOrientation, getCameraRotationCorrection, getCameraTiltAngle } from "@/lib/utils/camera";

describe("iOS 26 の内カメラの上下補正", () => {
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";

  it.each([90, -90, 270])("横向き %s 度では内カメラを180度補正する", (angle) => {
    expect(getCameraRotationCorrection("user", angle, safari)).toBe(180);
  });

  it.each([0, 180, 360])("縦向き %s 度には補正しない", (angle) => {
    expect(getCameraRotationCorrection("user", angle, safari)).toBe(0);
  });

  it("外カメラには補正しない", () => {
    expect(getCameraRotationCorrection("environment", 90, safari)).toBe(0);
    expect(getCameraRotationCorrection("environment", 270, safari)).toBe(0);
  });

  it("画面角度0度でも実機で確認した横向きの内カメラを180度補正する", () => {
    const angle = getCameraTiltAngle(0.3777591371503149, 80.07189540864353);
    expect(getCameraRotationCorrection("user", angle ?? 0, safari)).toBe(180);
    expect(getCameraRotationCorrection("environment", angle ?? 0, safari)).toBe(0);
  });

  it("OSバージョンをそのまま報告するiOSブラウザにも対応する", () => {
    const chrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1";
    expect(getCameraRotationCorrection("user", 270, chrome)).toBe(180);
  });

  it("旧iOS、Android、PCには補正しない", () => {
    expect(getCameraRotationCorrection("user", 90, safari.replace("Version/26.0", "Version/18.6"))).toBe(0);
    expect(getCameraRotationCorrection("user", 90, "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0")).toBe(0);
    expect(getCameraRotationCorrection("user", 90, "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15")).toBe(0);
  });
});

describe("画面角度に依存しないカメラの持ち方", () => {
  it.each([[0.3777591371503149, 80.07189540864353], [179.12490403773924, -87.83267788209366], [0, -80]])(
    "横向き beta=%s gamma=%s を判定する", (beta, gamma) => {
      expect(getCameraTiltAngle(beta, gamma)).toBe(90);
    },
  );

  it("実機の縦向きに戻したときは補正を解除する", () => {
    expect(getCameraTiltAngle(44.724937069792205, 18.685291796308825, 90)).toBe(0);
  });

  it("下向き、斜め、欠測では直前の向きを保つ", () => {
    expect(getCameraTiltAngle(0, 0, 90)).toBe(90);
    expect(getCameraTiltAngle(180, 0, 90)).toBe(90);
    expect(getCameraTiltAngle(35.264, 45, 90)).toBe(90);
    expect(getCameraTiltAngle(null, 80, 90)).toBe(90);
    expect(getCameraTiltAngle(0, Number.NaN)).toBeNull();
    expect(getCameraTiltAngle(0, 0)).toBeNull();
  });
});

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
