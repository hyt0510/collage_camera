"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** 読み取った文字列を受け取り、使えないときはエラー文言を、使えたときは null を返す */
  onDetect: (text: string) => string | null;
  onClose: () => void;
}

/**
 * 会場の QR コードをアプリ内で読み取る全画面。
 * OS のカメラで読むと別のタブ・別のブラウザで開いてしまい、撮影中の写真や解除の記録とずれるため、アプリ内で完結させる
 */
export function QrScannerScreen({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"pending" | "scanning" | "error">("pending");
  const [message, setMessage] = useState<string | null>(null);

  // 親が再描画されても読み取りループを作り直さないよう、最新の onDetect を ref で参照する
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanTimer: ReturnType<typeof setInterval> | undefined;
    let messageTimer: ReturnType<typeof setTimeout> | undefined;
    // 使えない QR を写し続けたときに、同じエラーを出し続けないため
    let lastRejected = "";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia is not supported");
        // 読み取り部品は、この画面を開いたときだけ読み込む
        const [media, { default: jsQR }] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
          import("jsqr"),
        ]);
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play().catch(() => {});
        setStatus("scanning");

        scanTimer = setInterval(() => {
          if (!ctx || video.readyState < 2 || video.videoWidth === 0) return;
          // 読み取りを軽くするため、長辺 640px に縮めてから解析する
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
          if (!code || code.data === lastRejected) return;

          const error = onDetectRef.current(code.data);
          if (!error) return;
          lastRejected = code.data;
          setMessage(error);
          clearTimeout(messageTimer);
          messageTimer = setTimeout(() => {
            setMessage(null);
            lastRejected = "";
          }, 2000);
        }, 300);
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void start();

    return () => {
      cancelled = true;
      clearInterval(scanTimer);
      clearTimeout(messageTimer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black animate-camera-open">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* 読み取り枠（枠の外を暗くする） */}
      {status === "scanning" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-64 max-w-[70vw] aspect-square rounded-lg border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
        </div>
      )}

      {status === "pending" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-zinc-600 border-t-white rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">カメラを起動中...</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-8">
          <div className="w-full max-w-sm bg-white p-6 text-center shadow-[4px_4px_0_0_rgba(0,0,0,0.5)]">
            <p className="text-base font-bold text-zinc-900">カメラを使えません</p>
            <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
              標準のカメラアプリで QR コードを読み取ってください。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full py-3 bg-zinc-800 text-white font-bold text-sm border-2 border-zinc-900"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 上部：戻るボタンと案内 */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-12 pb-6 px-5 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white flex-shrink-0 active:scale-90 transition-transform"
            aria-label="戻る"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          {status === "scanning" && (
            <p className="text-sm font-bold text-white">QRコードを枠に合わせてください</p>
          )}
        </div>
      </div>

      {message && (
        <p className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-[85%] max-w-sm rounded-sm bg-white px-4 py-3 text-center text-sm font-bold text-rose-700 shadow">
          {message}
        </p>
      )}
    </div>
  );
}
