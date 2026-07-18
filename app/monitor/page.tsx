"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Firebase クライアントの読み込みを削除 (API経由でデータを取得するため)
import { GRID_COLS, GRID_ROWS, generateCollageMosaicPlacements } from "@/lib/utils/mosaic";
import { CollageBackground } from "@/components/features/collage/CollageBackground";

type MonitorSubmission = {
  id: string;
  placement: { row: number; col: number };
  items: Array<{ imageUrl?: string; dataUrl?: string; theme: string }>;
  collageImageUrl?: string;
  collageDataUrl?: string;
};

// モザイクアートの設定は mosaic.ts からインポート
const placements = generateCollageMosaicPlacements();

export default function MonitorPage() {
  const [submissions, setSubmissions] = useState<MonitorSubmission[]>([]);
  const [popup, setPopup] = useState<MonitorSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const res = await fetch("/api/submissions");
        if (!res.ok) throw new Error("Failed to fetch submissions");
        const data = await res.json();
        const nextItems = (data.submissions || []) as MonitorSubmission[];
        
        setError(null);

        const newItems = nextItems.filter((item) => !knownIds.current.has(item.id));
        
        if (!isFirstLoad.current && newItems.length > 0) {
          const latest = newItems[0]!;
          setPopup(latest);
          setTimeout(() => setPopup(null), 3000);
        }

        knownIds.current = new Set(nextItems.map((item) => item.id));
        setSubmissions(nextItems);
        isFirstLoad.current = false;
      } catch (err: any) {
        console.error("Fetch error:", err);
        setError(`Fetch Error: ${err.message}`);
      }
    };

    fetchSubmissions();

    // 5分毎にポーリング (Firestoreの読み取りコストを抑えるため)
    const interval = setInterval(fetchSubmissions, 300000);

    return () => clearInterval(interval);
  }, []);

  // グリッドマップを作成
  const grid = useMemo(() => {
    const map = new Map<string, MonitorSubmission>();
    // 古い順に配置して新しいものを上書き
    for (let i = submissions.length - 1; i >= 0; i--) {
      const submission = submissions[i]!;
      if (!submission.placement) continue;
      const key = `${submission.placement.row}-${submission.placement.col}`;
      map.set(key, submission);
    }
    return map;
  }, [submissions]);

  return (
    <main className="relative min-h-screen bg-[#F5F3EE] text-zinc-900 p-2 overflow-hidden flex items-center justify-center">
      <CollageBackground isOverlay={false} />

      {error && (
        <div className="absolute top-20 left-4 z-20 max-w-xs rounded-lg bg-rose-500/20 p-3 border border-rose-500/30 backdrop-blur-md">
          <p className="text-[10px] text-rose-500 font-mono leading-relaxed">{error}</p>
        </div>
      )}

      {/* 高密度グリッド表示 */}
      <section 
        className="mx-auto grid w-full max-w-[95vw] aspect-[16/9] relative z-10"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
          gap: "3px" // コラージュらしく少し隙間をあける
        }}
      >
        {placements.map((p) => {
          const item = grid.get(`${p.row}-${p.col}`);
          const displayUrl = item?.collageImageUrl || item?.collageDataUrl || (item?.items?.[0]?.imageUrl || item?.items?.[0]?.dataUrl);
          
          // 固定シードによるランダムな回転とスケールでコラージュ感を演出
          const randomRot = ((p.row * 13 + p.col * 7) % 21) - 10; // -10 to +10 degrees
          const randomScale = 1 + (((p.row * 7 + p.col * 11) % 10) / 40); // 1.0 to 1.25

          return (
            <div
              key={`${p.row}-${p.col}`}
              className="relative transition-all duration-1000 group hover:z-50 hover:scale-150"
              style={{
                gridColumn: p.col + 1,
                gridRow: p.row + 1,
                zIndex: item ? 10 : 1,
              }}
            >
              <div 
                className="w-full h-full transition-all duration-700 shadow-[2px_3px_5px_rgba(0,0,0,0.2)]"
                style={{
                  transform: `rotate(${randomRot}deg) scale(${randomScale})`,
                  backgroundColor: item ? "#fff" : "#E5E5E5",
                  padding: "2px", // 白枠(写真のフチ)
                }}
              >
                {displayUrl ? (
                  <img
                    src={displayUrl}
                    alt=""
                    className="h-full w-full object-cover animate-in fade-in zoom-in duration-1000"
                  />
                ) : (
                  <div className="w-full h-full border border-dashed border-zinc-300 opacity-50" />
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* 新着ポップアップ */}
      {popup && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-500">
          <div className="relative flex flex-col items-center gap-6 animate-in zoom-in-75 slide-in-from-bottom-12 duration-700">
            <div className="flex flex-col items-center">
              <div className="h-1 w-24 bg-indigo-500 rounded-full mb-4 animate-pulse" />
              <div className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">
                Fragment Received
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border-4 border-white/5 bg-zinc-900 shadow-[0_0_100px_rgba(79,70,229,0.4)]">
              {(() => {
                const pUrl = popup.collageImageUrl || popup.collageDataUrl || (popup.items?.[0]?.imageUrl || popup.items?.[0]?.dataUrl);
                return pUrl ? (
                  <img src={pUrl} alt="new" className="h-[50vh] aspect-[9/16] object-cover" />
                ) : (
                  <div className="h-80 w-80 flex items-center justify-center bg-zinc-800 text-xs">No Image</div>
                );
              })()}
            </div>
            <div className="font-mono text-[10px] text-white/50 bg-white/5 px-4 py-2 rounded-full border border-white/10">
              Allocating to Matrix: {popup.placement?.row},{popup.placement?.col}
            </div>
          </div>
        </div>
      )}

      {/* 装飾 */}
      <div className="fixed bottom-4 right-4 flex flex-col items-end font-mono text-[8px] uppercase tracking-tighter text-zinc-700 pointer-events-none">
        <span>Render.Engine: Mosaic-V1</span>
        <span>Resolution: {GRID_COLS}x{GRID_ROWS}</span>
        <span>Status: Syncing Realtime</span>
      </div>
    </main>
  );
}
