/** iOS 26 の内カメラで、横向きの映像が外カメラと上下逆になる場合の補正。 */
export function getCameraRotationCorrection(
  facing: "user" | "environment", angle: number, userAgent: string,
): 0 | 180 {
  // Safari 26 は OS バージョンを 18.6 と報告するため、Safari 自身のバージョンも見る。
  const isiOS26 = /iPhone/.test(userAgent) && /AppleWebKit/.test(userAgent)
    && (/Version\/26(?:\.|\s|$)/.test(userAgent) || /OS 26(?:[_\s.]|$)/.test(userAgent));
  const normalizedAngle = ((angle % 360) + 360) % 360;
  return facing === "user" && isiOS26 && (normalizedAngle === 90 || normalizedAngle === 270) ? 180 : 0;
}

/** 向き変更の通知をまとめ、画面更新後にカメラの向きを再取得する。 */
export function watchCameraOrientation(onChange: () => void) {
  let frame: number | null = null;
  let stopped = false;
  const update = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!stopped) onChange();
    });
  };
  const orientation = window.screen.orientation;
  orientation?.addEventListener("change", update);
  window.addEventListener("orientationchange", update);
  return () => {
    stopped = true;
    if (frame !== null) cancelAnimationFrame(frame);
    orientation?.removeEventListener("change", update);
    window.removeEventListener("orientationchange", update);
  };
}

/** 指の距離に合わせて、デジタルズームを1〜4倍に収める。 */
export function getPinchZoom(startZoom: number, startDistance: number, distance: number) {
  if (startDistance <= 0) return startZoom;
  return Math.min(4, Math.max(1, startZoom * distance / startDistance));
}

/** プレビューの中央拡大と同じ範囲を撮影する。 */
export function getCameraSourceRect(width: number, height: number, zoom: number) {
  const sw = width / zoom;
  const sh = height / zoom;
  return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh };
}

/** 起動の応答順にかかわらず、最後に要求されたカメラだけを使う。 */
export function createCameraSession() {
  let generation = 0;
  let active: MediaStream | null = null;

  function stop() {
    generation++;
    active?.getTracks().forEach((track) => track.stop());
    active = null;
  }

  async function start(acquire: () => Promise<MediaStream>): Promise<MediaStream | null> {
    stop();
    const version = generation;
    try {
      const stream = await acquire();
      if (version !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      active = stream;
      return stream;
    } catch (error) {
      if (version !== generation) return null;
      throw error;
    }
  }

  return { start, stop };
}
