"use client";

import React, { useRef } from "react";
import { CollageBackground } from "../collage/CollageBackground";

interface Props {
  imageDataUrl: string;
  theme: string;
  slotColor: string;
  clipPath?: string;
  onRetake: () => void;
  onUse: (image: HTMLImageElement) => void;
  error?: string;
}

export function CapturePreviewDialog({ imageDataUrl, theme, slotColor, clipPath, onRetake, onUse, error }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  return (
    <div className="absolute inset-0 bg-zinc-50 flex flex-col animate-preview-in p-6 pt-16 z-50 overflow-hidden landscape:flex-row landscape:gap-4 landscape:pt-[max(1.5rem,env(safe-area-inset-top))] landscape:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <CollageBackground variant="minimal" />
      {/* プレビュー画像（スクラップブック風） */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 min-h-0 py-4 mt-4 landscape:flex-row landscape:min-w-0 landscape:py-0 landscape:mt-0 landscape:[container-type:size]">
        <div 
          className="scrapbook-photo relative mx-auto h-full max-h-[55vh] aspect-[9/16] landscape:h-auto landscape:max-h-none landscape:w-[min(100cqw,calc(56.25cqh-1.5rem))]"
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 rotate-3 masking-tape opacity-90 z-10" style={{ backgroundColor: slotColor }} />
          
          <div 
            className="relative w-full h-full overflow-hidden bg-zinc-200"
            style={clipPath ? { clipPath, WebkitClipPath: clipPath } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageDataUrl}
              alt="撮影した写真"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          {/* 縦向きでは従来どおり写真の下にテーマを添える */}
          <div className="absolute -bottom-10 left-0 right-0 text-center w-full landscape:hidden">
            <p className="text-xl font-bold text-zinc-800 whitespace-nowrap">{theme}</p>
          </div>
        </div>
      </div>

      <div className="contents landscape:relative landscape:z-10 landscape:shrink-0 landscape:flex landscape:flex-col landscape:gap-4 landscape:w-[38%] landscape:min-w-64 landscape:max-w-sm landscape:overflow-y-auto">
      {/* 横向きではテーマを右側の専用領域で折り返す */}
      <p className="hidden text-center text-xl font-bold text-zinc-800 break-words landscape:block">{theme}</p>
      {/* アクションボタン */}
      {error && <p role="alert" className="relative z-10 text-center text-sm text-red-700">{error}</p>}
      <div className="py-6 flex gap-4 mt-auto relative z-10 landscape:flex-col landscape:py-2">
        <button
          onClick={onRetake}
          className="flex-1 py-4 bg-white text-zinc-700 font-bold text-sm border-2 border-dashed border-zinc-400 active:scale-95 transition-transform"
          style={{ transform: "rotate(-1deg)" }}
        >
          撮り直す
        </button>
        <button
          onClick={() => {
            if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) onUse(imageRef.current);
          }}
          className="flex-1 py-4 text-zinc-900 font-bold text-sm shadow-[3px_4px_0_0_rgba(0,0,0,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all border-2 border-black bg-white"
          style={{ transform: "rotate(1deg)" }}
        >
          この写真を使用
        </button>
      </div>
      </div>
    </div>
  );
}
