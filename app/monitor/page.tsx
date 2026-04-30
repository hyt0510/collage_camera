"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

  useEffect(() => {
    async function poll() {
      try {
        const response = await fetch("/api/submissions", { cache: "no-store" });
        if (!response.ok) {
          console.warn(`Fetch failed: ${response.status} ${response.statusText}`);
          return;
        }
        const payload = (await response.json()) as { submissions: MonitorSubmission[] };
        const nextItems = payload.submissions;

        const newItems = nextItems.filter((item) => !knownIds.current.has(item.id));
        if (newItems.length > 0) {
          // nextItemsは降順(新→古)なので、newItemsの先頭が最新
          const latest = newItems[0]!;
          setPopup(latest);
          window.setTimeout(() => setPopup(null), 2000);
        }

        knownIds.current = new Set(nextItems.map((item) => item.id));
        setSubmissions(nextItems);
      } catch (error) {
        console.error("Monitor polling error:", error);
      }
    }

    void poll();
    const timerId = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(timerId);
  }, []);

  const grid = useMemo(() => {
    const map = new Map<string, MonitorSubmission>();
    // submissionsは新→古なので、後ろから（古い順に）Mapに入れることで
    // 同じ配置(key)の場合は新しいものが最終的に残るようにする
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
        <h1 className="text-2xl font-bold">collage monitor</h1>
        <p className="text-sm text-zinc-300">{submissions.length} fragments</p>
      </header>

      <section className="grid min-h-[80vh] grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, index) => {
          const row = Math.floor(index / 3);
          const col = index % 3;
          const item = grid.get(`${row}-${col}`);
          const displayUrl = item?.collageDataUrl || item?.items[0]?.dataUrl;
          
          return (
            <div
              key={`${row}-${col}`}
              className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-lg transition-all duration-500"
            >
              {displayUrl ? (
                <>
                  <img
                    src={displayUrl}
                    alt={item?.items[0]?.theme || "collage"}
                    className="h-full w-full object-cover animate-in fade-in duration-700"
                  />
                  {item?.items[0] && !item.collageDataUrl && (
                    <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] backdrop-blur-sm">
                      {item.items[0].theme}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-zinc-900/50 text-xs font-mono">waiting...</span>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {popup ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-popup overflow-hidden rounded-2xl border border-white/20 bg-black/40 p-2 backdrop-blur">
            {popup.collageDataUrl || popup.items[0] ? (
              <img
                src={popup.collageDataUrl || popup.items[0]?.dataUrl}
                alt={popup.items[0]?.theme || "collage"}
                className="h-56 w-56 rounded-xl object-cover"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
