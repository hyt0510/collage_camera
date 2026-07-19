"use client";

import React, { useRef, useEffect } from "react";
import { toSvgPolygonPoints } from "@/lib/utils/styles";

interface Props {
  stream: MediaStream | null;
  showGrid: boolean;
  clipPath?: string;
  slotColor?: string;
}

export function CameraPreview({ stream, showGrid, clipPath, slotColor }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    const startPlaying = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (e.name !== "AbortError") {
            console.error("Camera play error:", e);
          }
        });
      }
    };

    video.addEventListener("loadedmetadata", startPlaying);
    startPlaying(); // Try immediately as well

    return () => {
      video.removeEventListener("loadedmetadata", startPlaying);
      // We don't set srcObject to null here to avoid AbortError on rapid remounts
    };
  }, [stream]);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
      {/* 9:16のコンテナ。画面高さを超えないように調整 */}
      <div 
        className="relative w-full max-w-[56.25vh] aspect-[9/16] bg-zinc-900"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onClick={(e) => e.currentTarget.play()}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* ポリゴンクリップパスオーバーレイ */}
        {clipPath && (
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id="camera-cutout">
              <rect width="100" height="100" fill="white" />
              <polygon points={toSvgPolygonPoints(clipPath)} fill="black" />
            </mask>
          </defs>
          {/* 外側を暗くするマスク */}
          <rect
            width="100"
            height="100"
            fill="rgba(0, 0, 0, 0.6)"
            mask="url(#camera-cutout)"
          />
          {/* 枠線 */}
          <polygon
            points={toSvgPolygonPoints(clipPath)}
            fill="none"
            stroke={slotColor || "#ffffff"}
            strokeWidth="1.5"
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

        {/* 3x3 グリッドオーバーレイ */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none">
            {/* 縦線 */}
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
            {/* 横線 */}
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
          </div>
        )}
      </div>
    </div>
  );
}
