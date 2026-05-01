"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

type MonitorSubmission = {
  id: string;
  placement: { row: number; col: number };
  items: Array<{ dataUrl: string; theme: string }>;
  collageDataUrl?: string;
};

export default function MonitorPage() {
  const [submissions, setSubmissions] = useState<MonitorSubmission[]>([]);
  const [popup, setPopup] = useState<MonitorSubmission | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    // Firestoreから承認済みの投稿をリアルタイムで購読
    const q = query(
      collection(db, "submissions"),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const nextItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MonitorSubmission[];

      // 新着チェック（ポップアップ表示用）
      const newItems = nextItems.filter((item) => !knownIds.current.has(item.id));
      
      // 初回ロード時はポップアップを出さない
      if (!isFirstLoad.current && newItems.length > 0) {
        const latest = newItems[0]!;
        setPopup(latest);
        const timer = window.setTimeout(() => setPopup(null), 3000);
        return () => window.clearTimeout(timer);
      }

      knownIds.current = new Set(nextItems.map((item) => item.id));
      setSubmissions(nextItems);
      isFirstLoad.current = false;
    }, (error) => {
      console.error("Firestore onSnapshot error:", error);
    });

    return () => unsubscribe();
  }, []);

  const grid = useMemo(() => {
    const map = new Map<string, MonitorSubmission>();
    for (let i = submissions.length - 1; i >= 0; i--) {
      const submission = submissions[i]!;
      const key = `${submission.placement.row}-${submission.placement.col}`;
      map.set(key, submission);
    }
    return map;
  }, [submissions]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 p-4 text-white">
      <header className="mb-4 flex items-end justify-between">
        <h1 className="text-2xl font-bold italic tracking-tighter text-indigo-500">
          COLLAGE <span className="text-white">MONITOR</span>
        </h1>
        <div className="flex flex-col items-end">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Live Fragments</p>
          <p className="font-mono text-xl font-bold leading-none">{submissions.length}</p>
        </div>
      </header>

      <section className="grid min-h-[85vh] grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, index) => {
          const row = Math.floor(index / 3);
          const col = index % 3;
          const item = grid.get(`${row}-${col}`);
          const displayUrl = item?.collageDataUrl || (item?.items && item.items[0]?.dataUrl);
          
          return (
            <div
              key={`${row}-${col}`}
              className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-white/5 bg-zinc-900/50 shadow-2xl transition-all duration-700"
            >
              {displayUrl ? (
                <>
                  <img
                    src={displayUrl}
                    alt="collage"
                    className="h-full w-full object-cover animate-in fade-in zoom-in-95 duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                  <div className="h-1 w-1 animate-ping rounded-full bg-indigo-500/50" />
                  <span className="text-[8px] uppercase tracking-widest text-zinc-700">Connecting</span>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 新着ポップアップ */}
      {popup && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="relative flex flex-col items-center gap-4 animate-in zoom-in-90 slide-in-from-bottom-8 duration-500">
            <div className="rounded-full bg-indigo-600 px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-xl">
              New Fragment Received
            </div>
            <div className="overflow-hidden rounded-3xl border-4 border-white/10 bg-zinc-900 shadow-[0_0_80px_rgba(79,70,229,0.3)]">
              <img
                src={popup.collageDataUrl || (popup.items && popup.items[0]?.dataUrl)}
                alt="new collage"
                className="h-80 w-80 object-cover"
              />
            </div>
          </div>
        </div>
      )}

      {/* 装飾 */}
      <div className="fixed bottom-4 left-4 flex gap-2 overflow-hidden font-mono text-[8px] uppercase tracking-tighter text-zinc-800">
        <span>System.Status: Active</span>
        <span>•</span>
        <span>Network.Sync: Realtime</span>
        <span>•</span>
        <span>Buffer.Mode: Optimized</span>
      </div>
    </main>
  );
}
