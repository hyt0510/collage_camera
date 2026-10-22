"use client";

import React, { useRef, useEffect } from "react";
import { getCenteredPolygon, toSvgPolygonPoints } from "@/lib/utils/styles";
import { getPinchZoom } from "@/lib/utils/camera";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  showGrid: boolean;
  clipPath?: string;
  slotColor?: string;
  zoom: number;
  rotation: 0 | 180;
  onZoomChange: (zoom: number) => void;
}

export function CameraPreview({ videoRef, stream, showGrid, clipPath, slotColor, zoom, rotation, onZoomChange }: Props) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const centeredClipPath = getCenteredPolygon(clipPath ?? "").clipPath;

  const getDistance = () => {
    const [first, second] = [...pointers.current.values()];
    return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || pointers.current.size >= 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: getDistance(), zoom };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current) {
      onZoomChange(getPinchZoom(pinch.current.zoom, pinch.current.distance, getDistance()));
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    pinch.current = null;
  };

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
  }, [stream, videoRef]);

  return (
    <div
      className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    >
      {/* 9:16のコンテナ。画面高さを超えないように調整 */}
      <div 
        className="relative w-full max-w-[56.25vh] aspect-[9/16] bg-zinc-900 overflow-hidden"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onClick={(e) => e.currentTarget.play()}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
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
              <polygon points={toSvgPolygonPoints(centeredClipPath)} fill="black" />
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
            points={toSvgPolygonPoints(centeredClipPath)}
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
