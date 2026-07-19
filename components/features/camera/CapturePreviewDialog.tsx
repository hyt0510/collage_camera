"use client";

import React from "react";
import { CollageBackground } from "../collage/CollageBackground";

interface Props {
  imageDataUrl: string;
  theme: string;
  slotColor: string;
  clipPath?: string;
  onRetake: () => void;
  onUse: () => void;
}

export function CapturePreviewDialog({ imageDataUrl, theme, slotColor, clipPath, onRetake, onUse }: Props) {
  return (
    <div className="absolute inset-0 bg-zinc-50 flex flex-col animate-preview-in p-6 pt-16 z-50 overflow-hidden">
      <CollageBackground />
      {/* プレビュー画像（スクラップブック風） */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        <div 
          className="scrapbook-photo w-full max-w-sm relative"
          style={{ transform: "rotate(-2deg)" }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 rotate-3 masking-tape opacity-90 z-10" style={{ backgroundColor: slotColor }} />
          
          <div 
            className="relative aspect-[9/16] w-full overflow-hidden bg-zinc-200"
            style={clipPath ? { clipPath, WebkitClipPath: clipPath } : undefined}
          >
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
      <div className="py-6 flex gap-4 mt-auto relative z-10">
        <button
          onClick={onRetake}
          className="flex-1 py-4 bg-white text-zinc-700 font-bold text-sm border-2 border-dashed border-zinc-400 active:scale-95 transition-transform"
          style={{ transform: "rotate(-1deg)" }}
        >
          撮り直す
        </button>
        <button
          onClick={onUse}
          className="flex-1 py-4 text-zinc-900 font-bold text-sm shadow-[3px_4px_0_0_rgba(0,0,0,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all border-2 border-black bg-white"
          style={{ transform: "rotate(1deg)" }}
        >
          この写真を使用
        </button>
      </div>
    </div>
  );
}
