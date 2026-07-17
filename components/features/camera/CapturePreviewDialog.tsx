"use client";

import React from "react";

interface Props {
  imageDataUrl: string;
  theme: string;
  slotColor: string;
  onRetake: () => void;
  onUse: () => void;
}

export function CapturePreviewDialog({ imageDataUrl, theme, slotColor, onRetake, onUse }: Props) {
  return (
    <div className="absolute inset-0 bg-black flex flex-col animate-preview-in">
      {/* プレビュー画像 */}
      <div className="flex-1 relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageDataUrl}
          alt="撮影した写真"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* テーマ表示（上部） */}
        <div className="absolute top-0 left-0 right-0 pt-12 pb-4 px-6 bg-gradient-to-b from-black/60 to-transparent">
          <p className="text-xs text-white/60 font-bold">📷 テーマ</p>
          <p className="text-sm text-white font-bold mt-0.5">{theme}</p>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="px-6 py-6 bg-black/95 flex gap-3">
        <button
          onClick={onRetake}
          className="flex-1 py-3.5 rounded-2xl bg-zinc-800 text-white font-bold text-sm border border-zinc-700 active:scale-95 transition-transform"
        >
          撮り直す
        </button>
        <button
          onClick={onUse}
          className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg active:scale-95 transition-transform"
          style={{ backgroundColor: slotColor }}
        >
          この写真を使用
        </button>
      </div>
    </div>
  );
}
