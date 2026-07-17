"use client";

import React, { useRef, useEffect } from "react";

interface Props {
  stream: MediaStream | null;
  showGrid: boolean;
}

export function CameraPreview({ stream, showGrid }: Props) {
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
