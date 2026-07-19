"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CameraPreview } from "./CameraPreview";
import { CameraControls } from "./CameraControls";
import { CapturePreviewDialog } from "./CapturePreviewDialog";
import { CameraPermissionError } from "./CameraPermissionError";

interface CameraScreenProps {
  theme: string;
  capturedCount: number;
  totalCount: number;
  slotColor: string;
  clipPath?: string;
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
  onCapture,
  onClose,
}: CameraScreenProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("pending");
  const [showFlash, setShowFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ストリーム停止ユーティリティ
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  // カメラ起動
  const startCamera = useCallback(async (facing: "user" | "environment") => {
    // getUserMedia 対応チェック
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionStatus("not-supported");
      return;
    }

    stopStream();

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

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
    }
  }, [stopStream]);

  // マウント時にカメラ起動、アンマウント時にストリーム解放
  useEffect(() => {
    startCamera(facingMode);

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
    // facingMode の変更時のみ再起動（startCamera は依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // シャッター処理
  const handleShutter = useCallback(() => {
    if (!streamRef.current) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    const settings = videoTrack.getSettings();
    const width = settings.width || 1920;
    const height = settings.height || 1080;

    // video要素を取得してキャプチャ
    const video = document.querySelector("video");
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    // 圧縮
    const MAX = 800;
    const scale = Math.min(1, MAX / Math.max(width, height));
    const outCanvas = document.createElement("canvas");
    outCanvas.width = Math.max(1, Math.round(width * scale));
    outCanvas.height = Math.max(1, Math.round(height * scale));
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return;
    outCtx.drawImage(canvas, 0, 0, outCanvas.width, outCanvas.height);

    const dataUrl = outCanvas.toDataURL("image/jpeg", 0.7);

    // フラッシュエフェクト
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 250);

    setCapturedImage(dataUrl);
  }, []);

  // カメラ切替
  const handleToggleCamera = useCallback(() => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    setTorchEnabled(false);
  }, []);

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
  }, []);

  // この写真を使用
  const handleUsePhoto = useCallback(() => {
    if (capturedImage) {
      stopStream();
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture, stopStream]);

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
    <div className="fixed inset-0 z-50 bg-black animate-camera-open" ref={videoRef as React.LegacyRef<HTMLDivElement>}>
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
        <>
          <CameraPreview stream={stream} showGrid={showGrid} clipPath={clipPath} slotColor={slotColor} />

          {/* 上部オーバーレイ: テーマ表示 */}
          <div className="absolute top-0 left-0 right-0 z-10 pt-12 pb-6 px-5 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
            <div className="flex items-start gap-3">
              {/* 戻るボタン */}
              <button
                onClick={handleClose}
                className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white flex-shrink-0 active:scale-90 transition-transform"
                aria-label="戻る"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </button>

              {/* テーマカード */}
              <div className="flex-1 mt-1">
                <div 
                  className="rounded-sm px-4 py-3 shadow-md relative"
                  style={{ backgroundColor: "#fefce8", transform: "rotate(1deg)" }}
                >
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 -rotate-2 masking-tape opacity-90" style={{ backgroundColor: slotColor }} />
                  <p className="text-[10px] font-bold text-zinc-500 tracking-wider">テーマ</p>
                  <p className="text-base font-bold text-zinc-900 mt-0.5 leading-snug">{theme}</p>
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
        </>
      )}

      {/* 撮影後プレビュー */}
      {capturedImage && (
        <CapturePreviewDialog
          imageDataUrl={capturedImage}
          theme={theme}
          slotColor={slotColor}
          onRetake={handleRetake}
          onUse={handleUsePhoto}
        />
      )}

      {/* 閉じるボタン (エラー時以外の上部 fallback) */}
      {showError && (
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
