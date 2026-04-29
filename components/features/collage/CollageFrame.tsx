import { FrameTemplate } from "@/lib/collage-config";
import { hexToRgba, toSvgPolygonPoints, getPolygonBoundingBox } from "@/lib/utils/styles";

const SLOT_COLORS = ["#ef4444", "#f59e0b", "#84cc16", "#06b6d4", "#3b82f6", "#a855f7"];
// ... rest of imports unchanged

export function CollageFrame({ template, images, themeMap, onFileChange, onLog }: Props) {
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

          return (
            <div
              key={`slot-${polygon.id}`}
              className="absolute inset-0 overflow-hidden"
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
            >
              {image && (
                <div 
                  className="absolute"
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
              {/* デバッグ用：画像の状態をオーバーレイ表示（開発時のみ） */}
              {process.env.NODE_ENV === "development" && (
                <div className="absolute top-0 left-0 bg-black/50 text-[8px] text-white p-1">
                  {polygon.id}: {image ? "SET" : "EMPTY"}
                </div>
              )}
              {!image ? (
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-white/85 px-2 py-1 text-base leading-none text-zinc-700">
                  📷
                </span>
              ) : null}
            </div>
          );
        })}

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {template.polygons.map((polygon) => {
            const color = slotColorMap[polygon.id]!;
            const points = toSvgPolygonPoints(polygon.clipPath);
            return (
              <polygon
                key={`line-${polygon.id}`}
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {template.polygons.map((polygon, index) => {
          const color = slotColorMap[polygon.id]!;
          return (
            <div
              key={`row-${polygon.id}`}
              className="flex flex-col gap-1 p-3 rounded-xl border-2 bg-white shadow-sm"
              style={{ borderColor: color }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-zinc-900">枠 {index + 1}: {themeMap[polygon.id]}</span>
                {images[polygon.id] ? (
                  <span className="text-emerald-600 font-bold text-xs">✓ 撮影済み</span>
                ) : (
                  <span className="text-rose-500 font-bold text-xs">未撮影</span>
                )}
              </div>

              {images[polygon.id] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={images[polygon.id]}
                  alt={`slot-${polygon.id}`}
                  className="h-12 w-12 rounded object-cover border border-zinc-300 mb-1"
                  onLoad={() => onLog(`IMG rendered: ${polygon.id}`)}
                  onError={() => onLog(`IMG render error: ${polygon.id}`)}
                />
              ) : null}

              {/* カメラ起動ボタンのみ残す */}
              <div className="flex flex-col gap-2 w-full mt-2">
                <div className="relative w-full h-12 bg-zinc-900 text-white rounded-lg font-bold text-xs shadow-md active:bg-zinc-800 active:scale-95 transition-all">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span>📸 カメラを起動して撮影</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      onLog(`CAMERA INPUT CHANGED: ${polygon.id}`);
                      onFileChange(e, polygon.id);
                    }}
                    onClick={() => onLog(`CAMERA CLICKED: ${polygon.id}`)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
