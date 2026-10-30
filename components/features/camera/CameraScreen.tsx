"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CameraPreview } from "./CameraPreview";
import { CameraControls } from "./CameraControls";
import { CapturePreviewDialog } from "./CapturePreviewDialog";
import { createCameraSession, drawCameraFrame, watchCameraOrientation } from "@/lib/utils/camera";
import { CameraPermissionError } from "./CameraPermissionError";
import { getCenteredPolygon } from "@/lib/utils/styles";
import { createSlotPhoto } from "@/lib/utils/image";
import { useCameraRotation } from "@/hooks/useCameraRotation";

type FrameRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

interface CameraScreenProps {
  theme: string;
  capturedCount: number;
  totalCount: number;
  slotColor: string;
  clipPath?: string;
  getTargetRect?: () => FrameRect | null;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

type PermissionStatus = "pending" | "granted" | "denied" | "not-supported" | "error";

export function CameraScreen({
  theme,
  capturedCount,
  totalCount,
  slotColor,
  clipPath,
  getTargetRect,
  onCapture,
  onClose,
}: CameraScreenProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const { rotation, needsSensor, requestSensor } = useCameraRotation(facingMode);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("pending");
  const [showFlash, setShowFlash] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pasting, setPasting] = useState<{
    dataUrl: string;
    from: FrameRect;
    to: FrameRect;
    complete: () => void;
  } | null>(null);
  const pasteRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const confirmingRef = useRef(false);
  const centeredPolygon = getCenteredPolygon(clipPath ?? "");

  useEffect(() => {
    if (!pasting || !pasteRef.current) return;
    const animation = pasteRef.current.animate([
      { left: `${pasting.from.left}px`, top: `${pasting.from.top}px`, width: `${pasting.from.width}px`, height: `${pasting.from.height}px` },
      { left: `${pasting.to.left}px`, top: `${pasting.to.top}px`, width: `${pasting.to.width}px`, height: `${pasting.to.height}px` },
    ], {
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    });
    animation.onfinish = pasting.complete;
    return () => animation.cancel();
  }, [pasting]);

  const streamRef = useRef<MediaStream | null>(null);
  const [session] = useState(createCameraSession);
  const switchingRef = useRef(false);

  // ストリーム停止ユーティリティ
  const stopStream = useCallback(() => {
    session.stop();
    streamRef.current = null;
    setStream(null);
  }, [session]);

  // カメラ起動
  const startCamera = useCallback(async (facing: "user" | "environment") => {
    // getUserMedia 対応チェック
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionStatus("not-supported");
      return;
    }

    stopStream();

    try {
      const newStream = await session.start(() => navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }));
      if (!newStream) return;

      streamRef.current = newStream;
      setStream(newStream);
      setPermissionStatus("granted");

      // torch 対応チェック
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities?.();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hasTorch = (capabilities as any)?.torch === true;
          setTorchSupported(hasTorch);
        } catch {
          setTorchSupported(false);
        }
      }
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setPermissionStatus("denied");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setPermissionStatus("not-supported");
        } else {
          setPermissionStatus("error");
        }
      } else {
        setPermissionStatus("error");
      }
    } finally {
      switchingRef.current = false;
    }
  }, [stopStream, session]);

  // マウント時にカメラ起動、アンマウント時にストリーム解放
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void startCamera(facingMode); });

    return () => {
      cancelled = true;
      session.stop();
      streamRef.current = null;
    };
  }, [facingMode, startCamera, session]);

  // iOS の向き変更前の映像を残さず、内・外カメラとも現在の向きで起動し直す。
  useEffect(() => {
    if ((permissionStatus !== "granted" && permissionStatus !== "pending") || pasting) return;
    return watchCameraOrientation(() => {
      setPermissionStatus("pending");
      setTorchEnabled(false);
      void startCamera(facingMode);
    });
  }, [facingMode, permissionStatus, pasting, startCamera]);

  // シャッター処理
  const handleShutter = useCallback(() => {
    if (!streamRef.current) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    // video要素を取得してキャプチャ
    const video = videoRef.current;
    // カメラの映像が届く前に押されると真っ黒な写真になるため、準備ができるまで無視する
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    // 端末の向きで縦横が入れ替わるため、トラックの設定値ではなく実際の映像サイズを使う
    const settings = videoTrack.getSettings();
    const width = video.videoWidth || settings.width || 1920;
    const height = video.videoHeight || settings.height || 1080;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawCameraFrame(ctx, video, rotation, zoom, facingMode === "user");

    // 圧縮
    const MAX = 1920;
    const scale = Math.min(1, MAX / Math.max(width, height));
    const outCanvas = document.createElement("canvas");
    outCanvas.width = Math.max(1, Math.round(width * scale));
    outCanvas.height = Math.max(1, Math.round(height * scale));
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return;
    outCtx.drawImage(canvas, 0, 0, outCanvas.width, outCanvas.height);

    const dataUrl = outCanvas.toDataURL("image/jpeg", 0.95);

    // フラッシュエフェクト
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 250);

    setCapturedImage(dataUrl);
  }, [zoom, rotation, facingMode]);

  // カメラ切替
  const handleToggleCamera = useCallback(() => {
    if (switchingRef.current) return;
    if (facingMode === "environment" && needsSensor) void requestSensor();
    switchingRef.current = true;
    setPermissionStatus("pending");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    setTorchEnabled(false);
    setZoom(1);
  }, [facingMode, needsSensor, requestSensor]);

  // フラッシュ切替
  const handleToggleFlash = useCallback(async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    const newTorch = !torchEnabled;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (videoTrack as any).applyConstraints({ advanced: [{ torch: newTorch }] });
      setTorchEnabled(newTorch);
    } catch {
      // torch not actually supported
      setTorchSupported(false);
    }
  }, [torchEnabled]);

  // グリッド切替
  const handleToggleGrid = useCallback(() => {
    setShowGrid(prev => !prev);
  }, []);

  // 撮り直す
  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setPreviewError("");
  }, []);

  // この写真を使用
  const handleUsePhoto = useCallback((image: HTMLImageElement) => {
    if (!capturedImage || confirmingRef.current) return;
    confirmingRef.current = true;
    try {
      const dataUrl = createSlotPhoto(image, clipPath ?? "");
      const rect = image.getBoundingClientRect();
      const target = getTargetRect?.();
      stopStream();
      if (!target) {
        onCapture(dataUrl);
        return;
      }
      // 元の枠の位置に補正した画像を、中央のプレビュー位置から配置先へ運ぶ
      setPasting({
        dataUrl,
        from: { left: rect.left + centeredPolygon.offsetX * rect.width / 100,
          top: rect.top + centeredPolygon.offsetY * rect.height / 100,
          width: rect.width, height: rect.height },
        to: target,
        complete: () => onCapture(dataUrl),
      });
    } catch {
      confirmingRef.current = false;
      setPreviewError("写真を準備できませんでした。もう一度お試しください。");
    }
  }, [capturedImage, clipPath, getTargetRect, centeredPolygon.offsetX, centeredPolygon.offsetY, onCapture, stopStream]);

  // アルバムから選択（コントロール経由）
  const handleAlbumSelect = useCallback((dataUrl: string) => {
    setCapturedImage(dataUrl);
  }, []);

  // ネイティブカメラフォールバック（権限エラー時）
  const handleNativeCapture = useCallback((dataUrl: string) => {
    stopStream();
    onCapture(dataUrl);
  }, [onCapture, stopStream]);

  // 閉じる
  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  const showError = permissionStatus === "denied" || permissionStatus === "not-supported" || permissionStatus === "error";

  return (
    <div className={`fixed inset-0 z-50 ${pasting ? "" : "bg-black animate-camera-open"}`}>
      {/* ローディング */}
      {permissionStatus === "pending" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-zinc-600 border-t-white rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">カメラを起動中...</p>
          </div>
        </div>
      )}

      {/* エラー / フォールバック */}
      {showError && (
        <CameraPermissionError
          errorType={permissionStatus === "denied" ? "permission-denied" : permissionStatus === "not-supported" ? "not-supported" : "error"}
          onNativeCapture={handleNativeCapture}
          onClose={handleClose}
        />
      )}

      {/* カメラプレビュー */}
      {permissionStatus === "granted" && !capturedImage && (
        <div className="absolute inset-0 flex flex-col landscape:flex-row">
          <CameraPreview videoRef={videoRef} stream={stream} showGrid={showGrid} clipPath={clipPath} slotColor={slotColor} zoom={zoom} mirrored={facingMode === "user"} onZoomChange={setZoom} />

          <div className="contents landscape:flex landscape:w-[38%] landscape:min-w-64 landscape:max-w-sm landscape:flex-col landscape:overflow-y-auto">
          {/* 横向きではテーマを映像と別の領域に配置する */}
          <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 pt-12 pb-6 px-5 bg-gradient-to-b from-black/70 via-black/30 to-transparent landscape:static landscape:shrink-0 landscape:px-4 landscape:pt-4 landscape:pb-4 landscape:bg-none">
            <div className="flex items-start gap-3">
              {/* 戻るボタン */}
              <button
                onClick={handleClose}
                className="pointer-events-auto w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white flex-shrink-0 active:scale-90 transition-transform"
                aria-label="戻る"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </button>

              {/* テーマカード */}
              <div className="flex-1 mt-1 landscape:min-w-0">
                <div 
                  className="rounded-sm px-4 py-3 shadow-md relative"
                  style={{ backgroundColor: "#fefce8", transform: "rotate(1deg)" }}
                >
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 -rotate-2 masking-tape opacity-90" style={{ backgroundColor: slotColor }} />
                  <p className="text-[10px] font-bold text-zinc-500 tracking-wider">テーマ</p>
                  <p className="text-base font-bold text-zinc-900 mt-0.5 leading-snug landscape:break-words">{theme}</p>
                  <p className="text-[11px] text-zinc-500 mt-1.5 font-bold border-b border-zinc-200 inline-block pb-0.5">
                    {capturedCount} / {totalCount} 枚撮影済み
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 撮影フラッシュエフェクト */}
          {showFlash && (
            <div className="absolute inset-0 bg-white animate-capture-flash pointer-events-none z-20" />
          )}

          {/* 下部コントロール */}
          <CameraControls
            onShutter={handleShutter}
            onToggleCamera={handleToggleCamera}
            onToggleFlash={handleToggleFlash}
            onToggleGrid={handleToggleGrid}
            onAlbumSelect={handleAlbumSelect}
            flashEnabled={torchEnabled}
            flashSupported={torchSupported}
            showGrid={showGrid}
            slotColor={slotColor}
          />
          </div>
        </div>
      )}

      {/* 撮影後プレビュー */}
      {capturedImage && !pasting && (
        <CapturePreviewDialog
          imageDataUrl={capturedImage}
          theme={theme}
          slotColor={slotColor}
          clipPath={centeredPolygon.clipPath}
          error={previewError}
          onRetake={handleRetake}
          onUse={handleUsePhoto}
        />
      )}

      {pasting && (
        <>
          <span role="status" className="sr-only">写真を枠にはめています</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={pasteRef}
            src={pasting.dataUrl}
            alt=""
            className="fixed object-cover"
            style={{ ...pasting.from, clipPath, WebkitClipPath: clipPath }}
          />
        </>
      )}

      {/* 起動待ちでも画面を閉じ、遅れて届くカメラを停止できるようにする */}
      {(showError || permissionStatus === "pending") && (
        <button
          onClick={handleClose}
          className="absolute top-12 left-5 z-20 w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label="戻る"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
