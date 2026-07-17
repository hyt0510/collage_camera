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
    <div className="absolute inset-0 bg-black/95 flex flex-col animate-preview-in p-6 pt-16">
      {/* プレビュー画像（スクラップブック風） */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div 
          className="scrapbook-photo w-full max-w-sm relative"
          style={{ transform: "rotate(-2deg)" }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-white/70 rotate-3 masking-tape opacity-90 z-10" />
          
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="撮影した写真"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          
          {/* テーマ手書き風 */}
          <div className="mt-4 text-center">
            <p className="text-xl font-bold text-zinc-800">{theme}</p>
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="py-6 flex gap-4 mt-auto">
        <button
          onClick={onRetake}
          className="flex-1 py-4 bg-transparent text-white font-bold text-sm active:scale-95 transition-transform underline decoration-2 underline-offset-4"
        >
          撮り直す
        </button>
        <button
          onClick={onUse}
          className="flex-1 py-4 text-zinc-900 font-bold text-sm shadow-[3px_4px_0_0_rgba(255,255,255,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all border-2 border-white bg-white"
          style={{ transform: "rotate(1deg)" }}
        >
          この写真を使用
        </button>
      </div>
    </div>
  );
}
