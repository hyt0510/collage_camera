
import { FrameTemplate, getSlotLockId } from "@/lib/collage-config";
import { hexToRgba, toSvgPolygonPoints, getPolygonBoundingBox, getPolygonCenter } from "@/lib/utils/styles";

const SLOT_COLORS = ["#CA0000", "#010193", "#E3C91D", "#1E1E1E", "#F5F3EE"];

const getContrastColor = (hex: string) => 
  (hex === "#E3C91D" || hex === "#F5F3EE") ? "#1E1E1E" : "#F5F3EE";

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
  unlockedQRs?: string[];
  presetId?: string | null;
}

export function CollageFrame({ template, images, themeMap, selectedSlotId, onSlotSelect, onLog, unlockedQRs = [], presetId }: Props) {
  const slotColorMap = template.polygons.reduce<Record<string, string>>((acc, polygon, index) => {
    acc[polygon.id] = SLOT_COLORS[index % SLOT_COLORS.length] ?? SLOT_COLORS[0]!;
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full rounded-[24px] bg-zinc-300 p-2 shadow-inner">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[18px] border-2 border-zinc-700 bg-zinc-200">
        {template.polygons.map((polygon, index) => {
          const image = images[polygon.id];
          const color = slotColorMap[polygon.id]!;
          const box = getPolygonBoundingBox(polygon.clipPath);
          const center = getPolygonCenter(polygon.clipPath);
          const isSelected = selectedSlotId === polygon.id;
          const theme = themeMap[polygon.id] ?? "";

          // ロック状態の判定
          const lockId = presetId ? getSlotLockId(presetId, index) : null;
          const isLocked = lockId ? !unlockedQRs.includes(lockId) : false;

          return (
            <div
              key={`slot-${polygon.id}`}
              className="absolute inset-0 overflow-hidden cursor-pointer"
              style={{
                clipPath: polygon.clipPath,
                WebkitClipPath: polygon.clipPath,
                backgroundColor: isLocked ? "#a1a1aa" : (image ? "transparent" : "#d1d5db"),
                backgroundImage: image
                  ? "none"
                  : isLocked
                    ? `repeating-linear-gradient(45deg, #94a3b8 0, #94a3b8 8px, #cbd5e1 8px, #cbd5e1 16px)`
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
                  className="absolute inset-0 animate-paste-in"
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

              {/* 未撮影時のテーマ短縮ラベル / ロック表示 */}
              {!image && (
                <span
                  className="pointer-events-none absolute flex flex-col items-center gap-1"
                  style={{
                    left: `${center.x}%`,
                    top: `${center.y}%`,
                    transform: `translate(-50%, -50%) rotate(${Math.random() * 6 - 3}deg)`,
                  }}
                >
                  {isLocked ? (
                    <span
                      className="bg-zinc-800 text-white rounded-full p-2 flex items-center justify-center shadow-md border-2 border-zinc-600 w-9 h-9"
                      style={{ fontSize: "14px" }}
                    >
                      🔒
                    </span>
                  ) : (
                    <span
                      className="masking-tape text-[10px] font-bold whitespace-nowrap opacity-90"
                      style={{ 
                        backgroundColor: color, 
                        color: getContrastColor(color) 
                      }}
                    >
                      {shortenTheme(theme)}
                    </span>
                  )}
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
                  {polygon.id}: {image ? "SET" : "EMPTY"}{isLocked ? " (LOCKED)" : ""}
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
