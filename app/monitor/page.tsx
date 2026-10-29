"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Firebase クライアントの読み込みを削除 (API経由でデータを取得するため)
import { generateCollageMosaicPlacements } from "@/lib/utils/mosaic";
import { CollageBackground } from "@/components/features/collage/CollageBackground";
import { MonitorStage } from "@/components/features/collage/MonitorStage";
import { useMonitorPreviewPublisher } from "@/hooks/useMonitorPreviewPublisher";
import { useMonitorClosed } from "@/hooks/useMonitorClosed";
import { isMonitorClosed } from "@/lib/monitor-schedule";

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
  const gridRef = useRef<HTMLElement>(null);
  const deadlineReached = useMonitorClosed();
  const [serverClosed, setServerClosed] = useState(false);
  const closed = deadlineReached || serverClosed;
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const previewMessage = useMonitorPreviewPublisher(gridRef, closed ? null : previewSource);

  useEffect(() => {
    if (closed || isMonitorClosed()) return;
    let cancelled = false;
    let fetching = false;
    let etag: string | null = null;
    let popupTimer: ReturnType<typeof setTimeout>;
    const fetchSubmissions = async () => {
      if (fetching || isMonitorClosed()) return;
      fetching = true;
      try {
        const res = await fetch("/api/submissions", {
          cache: "no-store",
          headers: etag ? { "If-None-Match": etag } : {},
          signal: AbortSignal.timeout(5_000),
        });
        if (res.status === 410) {
          if (!cancelled) setServerClosed(true);
          return;
        }
        if (res.status === 304) {
          if (!cancelled) setError(null);
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch submissions");
        const data = await res.json();
        if (cancelled) return;
        etag = res.headers.get("ETag");
        setPreviewSource(etag);
        const nextItems = (data.submissions || []) as MonitorSubmission[];
        
        setError(null);

        const newItems = nextItems.filter((item) => !knownIds.current.has(item.id));
        
        if (!isFirstLoad.current && newItems.length > 0) {
          const latest = newItems[0]!;
          setPopup(latest);
          clearTimeout(popupTimer);
          popupTimer = setTimeout(() => setPopup(null), 3000);
        }

        knownIds.current = new Set(nextItems.map((item) => item.id));
        setSubmissions(nextItems);
        isFirstLoad.current = false;
      } catch (err) {
        if (cancelled) return;
        console.error("Fetch error:", err);
        setSubmissions([]);
        setPreviewSource(null);
        // 画面を空にした後は、同じ一覧でも本文を取得して表示を戻す
        etag = null;
        setPopup(null);
        setError("通信を確認しています。復旧すると自動で表示を再開します。");
      } finally {
        fetching = false;
      }
    };

    fetchSubmissions();

    // 非表示操作を早く反映する。API側は5秒間キャッシュして同時取得をまとめる
    const interval = setInterval(fetchSubmissions, 5_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(popupTimer);
    };
  }, [closed]);

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

  const visibleItems = useMemo(() => placements.flatMap((placement) => {
    const item = grid.get(`${placement.row}-${placement.col}`);
    const imageUrl = item?.collageImageUrl || item?.collageDataUrl || item?.items?.[0]?.imageUrl || item?.items?.[0]?.dataUrl;
    return imageUrl && item ? [{ row:placement.row,col:placement.col,imageUrl,submissionId:item.id }] : [];
  }),[grid]);

  if (closed) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F5F3EE] p-6 text-center text-zinc-800"><h1 className="text-xl font-bold">モニターの公開は終了しました。</h1></main>;
  }

  return (
    <main className="relative min-h-screen bg-[#F5F3EE] text-zinc-900 p-2 overflow-hidden flex items-center justify-center">
      <CollageBackground isOverlay={false} />

      {error && (
        <div className="absolute top-20 left-4 z-20 max-w-xs rounded-lg bg-rose-500/20 p-3 border border-rose-500/30 backdrop-blur-md">
          <p className="text-[10px] text-rose-500 font-mono leading-relaxed">{error}</p>
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-[95vw]">
        <MonitorStage items={visibleItems} stageRef={gridRef}/>
      </div>
      {/* 新着ポップアップ */}
      {popup && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-500">
          <div className="relative flex flex-col items-center gap-6 animate-in zoom-in-75 slide-in-from-bottom-12 duration-700">
            <div className="flex flex-col items-center">
              <div className="h-1 w-24 bg-indigo-500 rounded-full mb-4 animate-pulse" />
              <div className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">
                新しい作品が届きました
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border-4 border-white/5 bg-zinc-900 shadow-[0_0_100px_rgba(79,70,229,0.4)]">
              {(() => {
                const pUrl = popup.collageImageUrl || popup.collageDataUrl || (popup.items?.[0]?.imageUrl || popup.items?.[0]?.dataUrl);
                return pUrl ? (
                  <img src={pUrl} alt="new" className="h-[50vh] w-auto object-contain" />
                ) : (
                  <div className="h-80 w-80 flex items-center justify-center bg-zinc-800 text-xs">No Image</div>
                );
              })()}
            </div>
            <div className="font-mono text-[10px] text-white/50 bg-white/5 px-4 py-2 rounded-full border border-white/10">
              あなたの作品も、みんなのコラージュへ。
            </div>
          </div>
        </div>
      )}

      {/* 装飾 */}
      <div className="fixed bottom-4 right-4 max-w-sm text-right text-[10px] leading-relaxed text-zinc-600 pointer-events-none">
        <span>{previewMessage}</span>
      </div>
    </main>
  );
}
