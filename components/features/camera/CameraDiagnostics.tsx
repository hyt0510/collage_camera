"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { getCameraSourceRect } from "@/lib/utils/camera";
import type { CameraSensorSample, SensorPermission } from "@/hooks/useCameraRotation";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  requestedFacing: "user" | "environment";
  rotation: 0 | 180;
  automaticRotation: 0 | 180;
  rotationOverride: 0 | 180 | null;
  onRotationOverride: (rotation: 0 | 180 | null) => void;
  zoom: number;
  active: boolean;
  sensorPermission: SensorPermission;
  onEnableSensor: () => Promise<void>;
  getSensorSample: () => CameraSensorSample;
}


const permissionLabels: Record<SensorPermission, string> = {
  "not-requested": "未許可", requesting: "確認中", granted: "許可済み",
  denied: "拒否", unsupported: "非対応", error: "取得失敗",
};

interface DiagnosticSample {
  requestedFacing: string;
  actualFacing: string;
  screenAngle: number | null;
  legacyScreenAngle: number | null;
  screenType: string | null;
  viewport: { width: number; height: number };
  videoWidth: number;
  videoHeight: number;
  trackWidth: number | null;
  trackHeight: number | null;
  readyState: number;
  videoTime: number;
  videoTransform: string;
  rotation: number;
  automaticRotation: number;
  rotationSource: "automatic" | "manual";
  sensorPermission: SensorPermission;
  deviceOrientation: CameraSensorSample["deviceOrientation"];
  sensorAgeMs: number | null;
  standalone: boolean;
  zoom: number;
  userAgent: string;
}

export function CameraDiagnostics({ videoRef, stream, requestedFacing, rotation, automaticRotation,
  rotationOverride, onRotationOverride, zoom, active, sensorPermission, onEnableSensor, getSensorSample }: Props) {
  const [enabled] = useState(() => typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("cameraDebug") === "1");
  const [open, setOpen] = useState(false);
  const [samples, setSamples] = useState<DiagnosticSample[]>([]);
  const [images, setImages] = useState<{ raw: string; corrected: string } | null>(null);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rawVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!enabled || !open) return;
    const dialog = dialogRef.current;
    const video = rawVideoRef.current;
    dialog?.showModal();
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => setMessage("ライブ映像を再生できませんでした。記録画像で比較してください。"));
    }
    return () => {
      dialog?.close();
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [enabled, open, stream]);

  const record = () => {
    const video = videoRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!video || !track || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setMessage("映像が表示されてから記録してください。");
      return;
    }
    const raw = document.createElement("canvas");
    const corrected = document.createElement("canvas");
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    raw.width = corrected.width = Math.max(1, Math.round(video.videoWidth * scale));
    raw.height = corrected.height = Math.max(1, Math.round(video.videoHeight * scale));
    const rawContext = raw.getContext("2d");
    const correctedContext = corrected.getContext("2d");
    if (!rawContext || !correctedContext) {
      setMessage("診断画像を作成できませんでした。");
      return;
    }
    rawContext.drawImage(video, 0, 0, raw.width, raw.height);
    if (rotation === 180) {
      correctedContext.translate(corrected.width, corrected.height);
      correctedContext.rotate(Math.PI);
    }
    const { sx, sy, sw, sh } = getCameraSourceRect(video.videoWidth, video.videoHeight, zoom);
    correctedContext.drawImage(video, sx, sy, sw, sh, 0, 0, corrected.width, corrected.height);
    const settings = track.getSettings();
    // 取得した設定は必要な項目だけ残し、端末識別子や画像をコピー内容に含めない。
    const sample: DiagnosticSample = {
      requestedFacing, actualFacing: settings.facingMode ?? "unknown",
      screenAngle: window.screen.orientation?.angle ?? null,
      legacyScreenAngle: typeof window.orientation === "number" ? window.orientation : null,
      screenType: window.screen.orientation?.type ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      videoWidth: video.videoWidth, videoHeight: video.videoHeight,
      trackWidth: settings.width ?? null, trackHeight: settings.height ?? null,
      readyState: video.readyState, videoTime: Math.round(video.currentTime * 1000) / 1000,
      videoTransform: getComputedStyle(video).transform, rotation, zoom,
      automaticRotation, rotationSource: rotationOverride === null ? "automatic" : "manual",
      sensorPermission, ...getSensorSample(),
      standalone: window.matchMedia("(display-mode: standalone)").matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      userAgent: navigator.userAgent,
    };
    setSamples(previous => [...previous.slice(-5), sample]);
    setImages({ raw: raw.toDataURL("image/jpeg", 0.8), corrected: corrected.toDataURL("image/jpeg", 0.8) });
    setMessage("");
    setOpen(true);
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(samples, null, 2));
      setMessage("診断情報をコピーしました。");
    } catch {
      setMessage("コピーできませんでした。下の診断情報を選択してコピーしてください。");
    }
  };

  const latest = samples[samples.length - 1];
  if (!enabled) return null;
  return (
    <>
      {active && <div className="absolute top-3 right-3 z-40 max-w-[70%] text-right">
        <button type="button" onClick={record} disabled={!stream}
          className="rounded bg-white px-3 py-2 text-sm font-bold text-black disabled:opacity-50">
          カメラ診断を記録
        </button>
        {rotationOverride !== null && <p className="mt-1 bg-black/80 p-1 text-xs text-white">診断：手動補正 {rotation}°</p>}
        {!open && message && <p role="status" className="mt-1 bg-black/80 p-1 text-xs text-white">{message}</p>}
      </div>}
      <dialog ref={dialogRef} aria-label="カメラ診断" onCancel={() => setOpen(false)}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-zinc-950 p-3 text-white backdrop:bg-black/80">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-zinc-950 pb-3">
          <h2 className="font-bold">カメラ診断</h2>
          <button type="button" onClick={() => setOpen(false)} className="rounded bg-white px-3 py-2 text-sm text-black">診断を閉じる</button>
        </header>
        <p className="mb-3 text-sm">同じ持ち方で内・外カメラを記録してください。直近6件を保持します。</p>
        <div className="mb-3 rounded border border-zinc-600 p-3 text-sm">
          <button type="button" onClick={onEnableSensor}
            disabled={sensorPermission === "granted" || sensorPermission === "requesting"}
            className="rounded bg-white px-3 py-2 text-black disabled:opacity-50">傾きセンサーを有効にする</button>
          <p className="mt-2">センサー：{permissionLabels[sensorPermission]}</p>
          <p className="mt-1">許可後、比較したい持ち方にして再記録してください。</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="診断用の回転比較">
            <button type="button" onClick={() => onRotationOverride(null)} aria-pressed={rotationOverride === null}
              className="rounded border px-3 py-2 aria-pressed:bg-white aria-pressed:text-black">自動補正に戻す</button>
            <button type="button" onClick={() => onRotationOverride(0)} aria-pressed={rotationOverride === 0}
              className="rounded border px-3 py-2 aria-pressed:bg-white aria-pressed:text-black">診断で0度にする</button>
            <button type="button" onClick={() => onRotationOverride(180)} aria-pressed={rotationOverride === 180}
              className="rounded border px-3 py-2 aria-pressed:bg-white aria-pressed:text-black">診断で180度にする</button>
          </div>
          <p className="mt-2">現在：{rotationOverride === null ? "自動" : "手動"} {rotation}°。比較値は撮影にも適用し、カメラ切替時に自動へ戻します。</p>
          <button type="button" onClick={record} disabled={!stream}
            className="mt-2 rounded bg-white px-3 py-2 font-bold text-black disabled:opacity-50">現在の状態を再記録</button>
        </div>
        {latest && <p className="mb-3 text-sm">
          記録時：{latest.requestedFacing === "user" ? "内カメラ" : "外カメラ"}（取得：{latest.actualFacing}）／
          画面 {latest.screenAngle ?? latest.legacyScreenAngle ?? "不明"}°／補正 {latest.rotation}°／
          映像 {latest.videoWidth}×{latest.videoHeight}
        </p>}
        <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-3">
          <figure>
            <figcaption className="mb-1 text-sm">補正なしのライブ映像</figcaption>
            <video ref={rawVideoRef} autoPlay playsInline muted className="h-36 w-full bg-black object-contain" />
          </figure>
          {images && <>
            <figure>
              <figcaption className="mb-1 text-sm">記録時の補正前（Canvas）</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images.raw} alt="補正前のCanvas画像" className="h-36 w-full bg-black object-contain" />
            </figure>
            <figure>
              <figcaption className="mb-1 text-sm">記録時の補正後（撮影と同じ処理）</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images.corrected} alt="補正後のCanvas画像" className="h-36 w-full bg-black object-contain" />
            </figure>
          </>}
        </div>
        <p className="my-3 text-sm">{samples.length}件を記録。画像を含まない診断情報をコピーできます。</p>
        <button type="button" onClick={copy} className="rounded bg-white px-3 py-2 text-sm font-bold text-black">診断情報をコピー</button>
        {message && <p role="status" className="mt-2 text-sm">{message}</p>}
        <label htmlFor="camera-diagnostic-data" className="mt-3 block text-sm">診断情報</label>
        <textarea id="camera-diagnostic-data" readOnly value={JSON.stringify(samples, null, 2)}
          className="mt-1 h-40 w-full rounded border border-zinc-500 bg-zinc-900 p-2 font-mono text-xs" />
      </dialog>
    </>
  );
}
