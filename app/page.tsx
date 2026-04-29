"use client";

import { useCollageCapture } from "@/hooks/useCollageCapture";
import { CollageFrame } from "@/components/features/collage/CollageFrame";

export default function Home() {
  const {
    template, themeMap, images, logs, errorMessage,
    submitting, result, collageDataUrl, alreadySubmitted, submissionCount,
    handleFileChange, submit, reset, pushLog
  } = useCollageCapture();

  // 全枠埋まっているかチェック
  const allFilled = template?.polygons.every(p => !!images[p.id]) ?? false;

  const handleSaveImage = () => {
    if (!collageDataUrl) return;
    const link = document.createElement("a");
    link.href = collageDataUrl;
    link.download = `collage_${new Date().getTime()}.jpg`;
    link.click();
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-5 bg-zinc-50">
      <header className="rounded-2xl bg-white/90 p-4 shadow-sm border border-zinc-200 flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">collage</h1>
          <p className="mt-1 text-sm text-zinc-600">
            写真を撮影して、文化祭モニターに投稿しよう！
          </p>
        </div>
        {submissionCount > 0 && (
          <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-bounce">
            {submissionCount}回投稿済み
          </div>
        )}
      </header>

      {result && (
        <section className="rounded-2xl bg-indigo-50 p-5 text-sm text-indigo-900 border border-indigo-200 shadow-sm animate-in fade-in zoom-in duration-300">
          <h2 className="text-lg font-semibold text-indigo-950 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">✓</span>
            投稿完了！
          </h2>
          
          {collageDataUrl && (
            <div className="mt-4 relative group">
              <img 
                src={collageDataUrl} 
                alt="Your Collage" 
                className="w-full h-auto rounded-lg shadow-md border-2 border-white"
              />
              <button
                onClick={handleSaveImage}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3 bg-white text-indigo-600 rounded-xl font-bold border-2 border-indigo-100 hover:bg-indigo-50 active:scale-95 transition-all shadow-sm"
              >
                <span>画像を保存する</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              </button>
            </div>
          )}

          <div className="mt-4 space-y-3 pt-3 border-t border-indigo-100">
            <div className="space-y-1">
              <p>モニター配置: <span className="font-bold text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-100">{result.placementLabel}</span></p>
              <p className="text-xs text-indigo-700">この画面が表示されている間に画像を保存できます。</p>
            </div>
            
            <p className="text-[10px] font-mono bg-indigo-100/50 p-1 rounded text-center opacity-50">ID: {result.id}</p>
          </div>
        </section>
      )}

      {alreadySubmitted && !result && (
        <section className="rounded-2xl bg-emerald-50 p-6 text-center border border-emerald-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-emerald-600 text-xl">✓</div>
          <h2 className="text-lg font-bold text-emerald-900">この回は投稿済みです</h2>
          <p className="mt-2 text-sm text-emerald-700 leading-relaxed">
            ご参加ありがとうございました！<br />
            モニターに反映されるまでしばらくお待ちください。<br />
            <span className="text-xs mt-2 block opacity-75">※新しいプリセットが開始されると再度投稿できます。</span>
          </p>
        </section>
      )}

      {!alreadySubmitted && !result && template && (
        <section className="rounded-2xl bg-white p-3 shadow-sm border border-zinc-100">
          <CollageFrame
            template={template}
            images={images}
            themeMap={themeMap}
            onFileChange={handleFileChange}
            onLog={pushLog}
          />
        </section>
      )}

      {!alreadySubmitted && !result && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-zinc-100">
          <button
            type="button"
            onClick={submit}
            disabled={!allFilled || submitting}
            className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform disabled:bg-zinc-300 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                投稿中...
              </span>
            ) : "作品をモニターに送る"}
          </button>
          {errorMessage && (
            <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-100 animate-pulse">
              ⚠️ {errorMessage}
            </p>
          )}
        </section>
      )}

      {/* デバッグログ（テスト時のみ表示） */}
      <section className="rounded-2xl bg-zinc-900 p-4 shadow-xl">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System Console</h3>
          <span className="text-[10px] text-zinc-600 font-mono">v14.firebase</span>
        </div>
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="text-[10px] font-mono text-emerald-400/80 break-all leading-tight border-b border-emerald-900/20 pb-0.5">
              {log}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
