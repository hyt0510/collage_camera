"use client";

import type { CapturePanelMode } from "@/lib/utils/capture-panel";

interface Props {
  mode: CapturePanelMode;
  theme: string | null;
  slotColor: string;
  buttonTextColor: string;
  hasImage: boolean;
  lockMessage: string | null;
  submitting: boolean;
  errorMessage: string;
  onOpenCamera: () => void;
  onSubmit: () => void;
  onScanQr: () => void;
}

/**
 * 作成タブの下部パネル。お題・撮影ボタン・投稿ボタンを状態に応じて1か所に出す
 */
export function CapturePanel({
  mode,
  theme,
  slotColor,
  buttonTextColor,
  hasImage,
  lockMessage,
  submitting,
  errorMessage,
  onOpenCamera,
  onSubmit,
  onScanQr,
}: Props) {
  const showTheme = mode === "capture" || mode === "locked" || mode === "retakeOrSubmit";

  const cameraButton = (
    <button
      type="button"
      onClick={onOpenCamera}
      className="flex-1 h-12 font-bold text-sm shadow-[2px_3px_0_0_rgba(0,0,0,0.2)] active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2 border-2 border-black"
      style={{ backgroundColor: slotColor, color: buttonTextColor }}
    >
      <span className="text-lg">📸</span>
      <span className="tracking-widest">{hasImage ? "撮り直す" : "カメラで撮影"}</span>
    </button>
  );

  const submitButton = (
    <button
      type="button"
      onClick={onSubmit}
      disabled={submitting}
      className="flex-1 h-12 bg-zinc-800 text-white text-sm font-bold shadow-[3px_3px_0_0_rgba(0,0,0,0.2)] active:translate-y-0.5 active:shadow-none transition-all disabled:bg-zinc-400 disabled:shadow-none disabled:cursor-not-allowed border-2 border-zinc-900"
    >
      {submitting ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          投稿中...
        </span>
      ) : mode === "submit" ? "🎉 作品をモニターに送る" : "🎉 モニターに送る"}
    </button>
  );

  return (
    <section
      className="relative z-10 shrink-0 min-h-[126px] rounded-sm bg-white/95 px-4 py-3 border-2 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex flex-col justify-center gap-1.5"
      style={{ borderColor: showTheme ? slotColor : "#d4d4d8" }}
    >
      {errorMessage && (
        <p className="text-[11px] font-bold text-rose-700 leading-snug line-clamp-2">⚠️ {errorMessage}</p>
      )}

      {showTheme && theme && (
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-[10px] font-bold text-zinc-500 tracking-wider">テーマ</span>
          <p className="text-sm font-bold text-zinc-800 leading-snug line-clamp-2">{theme}</p>
          {hasImage && <span className="shrink-0 text-[10px] font-bold text-emerald-600">✓ 撮影済み</span>}
        </div>
      )}

      {mode === "hint" && (
        <p className="text-center text-sm font-bold text-zinc-600">枠をタップしてお題を選ぼう 👆</p>
      )}

      {mode === "capture" && <div className="flex">{cameraButton}</div>}

      {mode === "locked" && (
        // パネルの高さを他の状態とそろえるため、案内は枠なしの2行までにしてボタンと並べる
        <>
          <p className="text-[11px] font-bold text-zinc-600 leading-snug line-clamp-2">
            🔒 {lockMessage ?? "この枠を撮影するには、QRコードをスキャンしてください！"}
          </p>
          <div className="flex">
            <button
              type="button"
              onClick={onScanQr}
              className="flex-1 h-9 bg-white text-zinc-800 text-sm font-bold border-2 border-zinc-800 shadow-[2px_3px_0_0_rgba(0,0,0,0.2)] active:translate-y-0.5 active:shadow-none transition-all"
            >
              📷 QRコードを読み取る
            </button>
          </div>
        </>
      )}

      {mode === "submit" && (
        <>
          <p className="text-center text-xs font-bold text-zinc-600">全部の枠がそろいました！</p>
          <div className="flex">{submitButton}</div>
        </>
      )}

      {mode === "retakeOrSubmit" && (
        <div className="flex gap-2">
          {cameraButton}
          {submitButton}
        </div>
      )}
    </section>
  );
}
