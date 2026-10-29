"use client";

import { useMonitorPreview } from "@/hooks/useMonitorPreview";
import { MonitorStage } from "@/components/features/collage/MonitorStage";

export function MonitorPanel() {
  const preview = useMonitorPreview();
  return (
    <section className="relative z-10 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-zinc-800">みんなのコラージュ</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">会場モニターに集まった作品のようすです。</p>
      </div>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-[#F5F3EE]">
        {preview.imageUrl ? (
          preview.atlas ? <MonitorStage items={preview.atlas.placements} atlas={{...preview.atlas,imageUrl:preview.imageUrl}}/> :
            <img src={preview.imageUrl} alt="会場モニターに集まったコラージュ全体" className="h-full w-full object-contain" />
        ) : (
          <p className="px-5 text-center text-sm leading-relaxed text-zinc-500" role="status">
            {preview.status === "closed" ? "モニターの公開は終了しました。" : preview.status === "paused" ? "自動更新を停止しています。新しい作品を見るには、下のボタンを押してください。" : preview.status === "loading" ? "モニターを読み込み中…" : preview.status === "error" ? "通信を確認しています。復旧すると自動で表示します。" : "モニターの更新を待っています。しばらくしてからご覧ください。"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500" aria-live="polite">
        <span>{preview.status === "closed" ? "公開終了" : preview.updatedAt ? `最終更新 ${new Date(preview.updatedAt).toLocaleTimeString("ja-JP")}` : "更新待ち"}</span>
        {preview.status !== "closed" && <span>{preview.status === "paused" ? "自動更新停止中" : "30秒ごとに確認・3分で自動停止"}</span>}
      </div>
      {preview.status === "paused" && (
        <button type="button" onClick={preview.resume} className="min-h-11 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
          新しい作品を見る
        </button>
      )}
    </section>
  );
}
