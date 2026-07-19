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
    video.play().catch(() => {
      // Autoplay may be blocked; user interaction will start it
    });

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
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
          {/* 外側を暗くするマスク */}
          <path
            d={`M 0,0 L 100,0 L 100,100 L 0,100 Z M ${toSvgPolygonPoints(clipPath)} Z`}
            fill="rgba(0, 0, 0, 0.6)"
            fillRule="evenodd"
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
  );
}
