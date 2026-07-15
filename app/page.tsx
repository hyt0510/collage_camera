"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCollageCapture } from "@/hooks/useCollageCapture";
import { CollageFrame } from "@/components/features/collage/CollageFrame";

export default function Home() {
  const { user, loading: authLoading, error: authError } = useAuth();

  const {
    template, themeMap, images, errorMessage,
    submitting, result, collageDataUrl, submissionCount, collageHistory,
    handleFileChange, submit, reset, pushLog
  } = useCollageCapture(user);

  const [activeTab, setActiveTab] = useState<"create" | "history">("create");

  // 認証中のローディング表示
  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-4 bg-zinc-50">
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">準備中...</p>
      </main>
    );
  }

  // 認証エラー表示
  if (authError) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-4 bg-zinc-50">
        <div className="rounded-2xl bg-rose-50 p-6 border border-rose-200 text-center">
          <p className="text-rose-700 font-bold">認証エラー</p>
          <p className="mt-2 text-sm text-rose-600">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-rose-600 text-white rounded-xl font-bold text-sm hover:bg-rose-700 transition-colors"
          >
            再読み込み
          </button>
        </div>
      </main>
    );
  }

  // 全枠埋まっているかチェック
  const allFilled = template?.polygons.every(p => !!images[p.id]) ?? false;

  const handleSaveImage = (dataUrl: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `collage_${new Date().getTime()}.jpg`;
    link.click();
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-5 bg-zinc-50 pb-20">
      <header className="rounded-2xl bg-white/90 p-4 shadow-sm border border-zinc-200">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">collage</h1>
            <p className="mt-1 text-sm text-zinc-600">
              写真を撮影して、モニターに投稿しよう！
            </p>
          </div>
          {submissionCount > 0 && (
            <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">
              {submissionCount}回目
            </div>
          )}
        </div>
        
        {/* タブ切り替え */}
        <div className="mt-4 flex p-1 bg-zinc-100 rounded-xl">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              activeTab === "create" ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500"
            }`}
          >
            作成
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all relative ${
              activeTab === "history" ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500"
            }`}
          >
            履歴
            {collageHistory.length > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full"></span>
            )}
          </button>
        </div>
      </header>

      {activeTab === "create" ? (
        <>
          {result ? (
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
                    onClick={() => handleSaveImage(collageDataUrl)}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-3 bg-white text-indigo-600 rounded-xl font-bold border-2 border-indigo-100 hover:bg-indigo-50 active:scale-95 transition-all shadow-sm"
                  >
                    <span>画像を保存する</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  </button>
                </div>
              )}

              <div className="mt-4 space-y-3 pt-3 border-t border-indigo-100 text-center">
                <button
                  onClick={reset}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  もう一度作成する
                </button>
              </div>
            </section>
          ) : (
            <>
              {template && (
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
            </>
          )}
        </>
      ) : (
        <section className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <h2 className="text-lg font-bold text-zinc-800 px-2">作成したコラージュ</h2>
          
          {collageHistory.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center border border-dashed border-zinc-300">
              <p className="text-zinc-400 text-sm">履歴がありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {collageHistory.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm border border-zinc-100">
                  <img 
                    src={item.dataUrl} 
                    alt={`Collage ${item.id}`} 
                    className="w-full h-auto rounded-lg shadow-sm mb-3"
                  />
                  <div className="flex justify-between items-center">
                    <div className="text-[10px] text-zinc-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    <button
                      onClick={() => handleSaveImage(item.dataUrl)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                      保存
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
