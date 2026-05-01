"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

type MonitorSubmission = {
  id: string;
  placement: { row: number; col: number };
  items: Array<{ imageUrl?: string; dataUrl?: string; theme: string }>;
  collageImageUrl?: string;
  collageDataUrl?: string;
};

// モザイクアートの設定 (16x48)
const GRID_COLS = 16;
const GRID_ROWS = 48;

export default function MonitorPage() {
  const [submissions, setSubmissions] = useState<MonitorSubmission[]>([]);
  const [popup, setPopup] = useState<MonitorSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      setError("Environment variables are missing.");
      return;
    }

    const q = query(
      collection(db, "submissions"),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(400) // 300人+αをカバー
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setError(null);
      const nextItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MonitorSubmission[];

      const newItems = nextItems.filter((item) => !knownIds.current.has(item.id));
      
      if (!isFirstLoad.current && newItems.length > 0) {
        const latest = newItems[0]!;
        setPopup(latest);
        const timer = window.setTimeout(() => setPopup(null), 3000);
        return () => window.clearTimeout(timer);
      }

      knownIds.current = new Set(nextItems.map((item) => item.id));
      setSubmissions(nextItems);
      isFirstLoad.current = false;
    }, (err) => {
      console.error("Firestore error:", err);
      setError(`Firestore Error: ${err.message}`);
    });

    return () => unsubscribe();
  }, []);

  // 16x48 のグリッドマップを作成
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
    <main className="relative min-h-screen bg-black text-white p-2">
      <header className="absolute top-4 left-4 z-10 flex flex-col gap-0.5 mix-blend-difference">
        <h1 className="text-3xl font-black italic tracking-tighter text-indigo-500 leading-none">
          COLLAGE <span className="text-white">MOSAIC</span>
        </h1>
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Collaborative Art Piece / {submissions.length} Fragments
        </p>
      </header>

      {error && (
        <div className="absolute top-20 left-4 z-20 max-w-xs rounded-lg bg-rose-500/20 p-3 border border-rose-500/30 backdrop-blur-md">
          <p className="text-[10px] text-rose-500 font-mono leading-relaxed">{error}</p>
        </div>
      )}

      {/* 高密度グリッド表示 */}
      <section 
        className="mx-auto grid gap-[1px] w-full max-w-[95vh] aspect-[9/27]"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, index) => {
          const row = Math.floor(index / GRID_COLS);
          const col = index % GRID_COLS;
          const item = grid.get(`${row}-${col}`);
          const displayUrl = item?.collageImageUrl || item?.collageDataUrl || (item?.items?.[0]?.imageUrl || item?.items?.[0]?.dataUrl);
          
          return (
            <div
              key={`${row}-${col}`}
              className={`relative overflow-hidden transition-all duration-1000 ${
                item ? "bg-zinc-800" : "bg-zinc-900/20"
              }`}
            >
              {displayUrl && (
                <img
                  src={displayUrl}
                  alt=""
                  className="h-full w-full object-cover animate-in fade-in zoom-in-50 duration-1000"
                />
              )}
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
