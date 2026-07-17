"use client";

import React, { useRef } from "react";

interface Props {
  onShutter: () => void;
  onToggleCamera: () => void;
  onToggleFlash: () => void;
  onToggleGrid: () => void;
  onAlbumSelect: (dataUrl: string) => void;
  flashEnabled: boolean;
  flashSupported: boolean;
  showGrid: boolean;
  slotColor: string;
}

export function CameraControls({
  onShutter,
  onToggleCamera,
  onToggleFlash,
  onToggleGrid,
  onAlbumSelect,
  flashEnabled,
  flashSupported,
  showGrid,
  slotColor,
}: Props) {
  const albumInputRef = useRef<HTMLInputElement>(null);

  const handleAlbumFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout")), 10000);
        img.onload = () => {
          clearTimeout(timeout);
          const MAX = 800;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas failed")); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
        img.src = url;
      });
      onAlbumSelect(dataUrl);
    } finally {
      URL.revokeObjectURL(url);
      e.target.value = "";
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 pb-8 pt-6 px-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
      {/* 上段: グリッドトグル */}
      <div className="flex justify-end mb-4">
        <button
          onClick={onToggleGrid}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all ${
            showGrid ? "bg-white/25 text-white" : "bg-white/10 text-white/50"
          }`}
          aria-label="グリッド切替"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
          </svg>
        </button>
      </div>

      {/* 下段: アルバム / シャッター / フラッシュ・カメラ切替 */}
      <div className="flex items-center justify-between">
        {/* アルバムから選択 */}
        <div className="relative w-14 h-14">
          <button
            className="w-14 h-14 bg-zinc-800 border-2 border-white flex items-center justify-center text-white active:scale-95 transition-transform shadow-[2px_2px_0_0_rgba(255,255,255,0.3)]"
            style={{ transform: "rotate(-3deg)" }}
            aria-label="アルバムから選択"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <input
            ref={albumInputRef}
            type="file"
            accept="image/*"
            onChange={handleAlbumFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* シャッターボタン */}
        <button
          onClick={onShutter}
          className="relative w-[80px] h-[80px] rounded-full flex items-center justify-center active:animate-shutter-pulse"
          aria-label="撮影"
        >
          {/* 外リング (少しずらして手書き風に) */}
          <div
            className="absolute inset-0 rounded-full border-4 opacity-90"
            style={{ borderColor: slotColor, transform: "rotate(15deg) scale(0.98)" }}
          />
          <div
            className="absolute inset-0 rounded-full border-4 opacity-50"
            style={{ borderColor: slotColor, transform: "rotate(-10deg) scale(1.02)" }}
          />
          {/* 内側の白い円 (少し歪ませる) */}
          <div 
            className="w-[62px] h-[62px] bg-white shadow-lg" 
            style={{ borderRadius: "48% 52% 47% 53% / 51% 49% 52% 48%" }}
          />
        </button>

        {/* フラッシュ + カメラ切替 */}
        <div className="flex flex-col gap-3">
          {flashSupported && (
            <button
              onClick={onToggleFlash}
              className={`w-12 h-12 flex items-center justify-center transition-all active:scale-95 shadow-[2px_2px_0_0_rgba(255,255,255,0.3)] border-2 ${
                flashEnabled ? "bg-yellow-400 text-yellow-900 border-yellow-200" : "bg-zinc-800 text-white border-white"
              }`}
              style={{ transform: "rotate(2deg)" }}
              aria-label="フラッシュ切替"
            >
              {flashEnabled ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={onToggleCamera}
            className="w-12 h-12 bg-zinc-800 border-2 border-white flex items-center justify-center text-white active:scale-95 transition-transform shadow-[2px_2px_0_0_rgba(255,255,255,0.3)]"
            style={{ transform: "rotate(-2deg)" }}
            aria-label="カメラ切替"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
              <path d="m21 3-18 18" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
