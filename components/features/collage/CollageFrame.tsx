
import React from "react";
import { FrameTemplate } from "@/lib/collage-config";
import { hexToRgba, toSvgPolygonPoints, getPolygonBoundingBox, getPolygonCenter } from "@/lib/utils/styles";

const SLOT_COLORS = ["#D62828", "#1E40AF", "#F4C430", "#1E1E1E", "#F5F3EE"];

const getContrastColor = (hex: string) => 
  (hex === "#F4C430" || hex === "#F5F3EE") ? "#1E1E1E" : "#F5F3EE";

/** テーマ文字列を枠内ラベル用に短縮する */
function shortenTheme(theme: string, maxLen = 5): string {
  if (theme.length <= maxLen) return theme;
  return theme.slice(0, maxLen) + "…";
}

interface Props {
  template: FrameTemplate;
  images: Record<string, string>;
  themeMap: Record<string, string>;
  selectedSlotId: string | null;
  onSlotSelect: (slotId: string) => void;
  onLog: (msg: string) => void;
}

export function CollageFrame({ template, images, themeMap, selectedSlotId, onSlotSelect, onLog }: Props) {
  const slotColorMap = template.polygons.reduce<Record<string, string>>((acc, polygon, index) => {
    acc[polygon.id] = SLOT_COLORS[index % SLOT_COLORS.length] ?? SLOT_COLORS[0]!;
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full rounded-[24px] bg-zinc-300 p-2 shadow-inner">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[18px] border-2 border-zinc-700 bg-zinc-200">
        {template.polygons.map((polygon) => {
          const image = images[polygon.id];
          const color = slotColorMap[polygon.id]!;
          const box = getPolygonBoundingBox(polygon.clipPath);
          const center = getPolygonCenter(polygon.clipPath);
          const isSelected = selectedSlotId === polygon.id;
          const theme = themeMap[polygon.id] ?? "";

          return (
            <div
              key={`slot-${polygon.id}`}
              className="absolute inset-0 overflow-hidden cursor-pointer"
              style={{
                clipPath: polygon.clipPath,
                WebkitClipPath: polygon.clipPath,
                backgroundColor: image ? "transparent" : "#d1d5db",
                backgroundImage: image
                  ? "none"
                  : `linear-gradient(145deg, ${hexToRgba(color, 0.25)}, #e7e5e4)`,
                backgroundPosition: "center",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                transform: "scale(1.02)", // 2%拡大して隙間を埋める
              }}
              onClick={() => onSlotSelect(polygon.id)}
            >
              {image && (
                <div 
                  className="absolute animate-paste-in"
                  style={{
                    left: `${box.left}%`,
                    top: `${box.top}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    className="w-full h-full object-cover"
                    onLoad={() => onLog(`Main preview rendered: ${polygon.id}`)}
                    onError={() => onLog(`Main preview error: ${polygon.id}`)}
                  />
                </div>
              )}

              {/* 未撮影時のテーマ短縮ラベル */}
              {!image && (
                <span
                  className="pointer-events-none absolute flex flex-col items-center gap-1"
                  style={{
                    left: `${center.x}%`,
                    top: `${center.y}%`,
                    transform: `translate(-50%, -50%) rotate(${Math.random() * 6 - 3}deg)`,
                  }}
                >
                  <span
                    className="masking-tape text-[10px] font-bold whitespace-nowrap opacity-90"
                    style={{ 
                      backgroundColor: color, 
                      color: getContrastColor(color) 
                    }}
                  >
                    {shortenTheme(theme)}
                  </span>
                </span>
              )}

              {/* 選択中のハイライトオーバーレイ */}
              {isSelected && (
                <div
                  className="pointer-events-none absolute inset-0 animate-slot-selected"
                  style={{
                    boxShadow: `inset 0 0 0 3px ${color}`,
                    backgroundColor: hexToRgba(color, 0.12),
                  }}
                />
              )}

              {/* デバッグ用：画像の状態をオーバーレイ表示（開発時のみ） */}
              {process.env.NODE_ENV === "development" && (
                <div className="absolute top-0 left-0 bg-black/50 text-[8px] text-white p-1">
                  {polygon.id}: {image ? "SET" : "EMPTY"}
                </div>
              )}
            </div>
          );
        })}

        {/* 枠線SVG */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {template.polygons.map((polygon) => {
            const color = slotColorMap[polygon.id]!;
            const isSelected = selectedSlotId === polygon.id;
            const points = toSvgPolygonPoints(polygon.clipPath);
            return (
              <polygon
                key={`line-${polygon.id}`}
                points={points}
                fill="none"
                stroke={isSelected ? color : "#d1d5db"}
                strokeWidth={isSelected ? "3" : "1.5"}
                strokeDasharray="4 2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{
                  transition: "stroke-width 0.2s ease, stroke 0.2s ease",
                  filter: isSelected ? `drop-shadow(0 0 3px ${color})` : "none",
                }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
