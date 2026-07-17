"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCollageCapture } from "@/hooks/useCollageCapture";
import { CollageFrame } from "@/components/features/collage/CollageFrame";
import { CameraScreen } from "@/components/features/camera/CameraScreen";
import { CollageBackground } from "@/components/features/collage/CollageBackground";
import { CollageBackground } from "@/components/features/collage/CollageBackground";

export default function Home() {
  const { user, loading: authLoading, error: authError } = useAuth();

  const {
    template, themeMap, images, errorMessage,
    submitting, result, collageDataUrl, submissionCount, collageHistory,
    setImageDataUrl, submit, reset, pushLog
  } = useCollageCapture(user);

  const [activeTab, setActiveTab] = useState<"create" | "history">("create");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // 選択中のテーマ情報
  const selectedTheme = selectedSlotId ? themeMap[selectedSlotId] ?? null : null;
  const hasImageInSelected = selectedSlotId ? !!images[selectedSlotId] : false;

  // 選択中スロットの色（テープの色）
  const SLOT_COLORS = ["#CA0000", "#010193", "#E3C91D", "#1E1E1E", "#F5F3EE"];
  // 選択中スロットの色（テープの色）
  const SLOT_COLORS = ["#CA0000", "#010193", "#E3C91D", "#1E1E1E", "#F5F3EE"];
  const selectedSlotIndex = template?.polygons.findIndex(p => p.id === selectedSlotId) ?? -1;
  const selectedSlotColor = selectedSlotIndex >= 0 ? SLOT_COLORS[selectedSlotIndex % SLOT_COLORS.length] : "#CA0000";

  const getContrastColor = (hex: string) => 
    (hex === "#E3C91D" || hex === "#F5F3EE") ? "#1E1E1E" : "#F5F3EE";
  const selectedSlotColor = selectedSlotIndex >= 0 ? SLOT_COLORS[selectedSlotIndex % SLOT_COLORS.length] : "#CA0000";

  const getContrastColor = (hex: string) => 
    (hex === "#E3C91D" || hex === "#F5F3EE") ? "#1E1E1E" : "#F5F3EE";

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
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-5 bg-zinc-50 pb-28">
      <CollageBackground />
      <header 
        className="rounded-sm bg-zinc-50 p-4 shadow-[2px_2px_0_0_rgba(0,0,0,0.1)] border border-zinc-200 relative z-10"
        style={{ transform: "rotate(-1deg)" }}
      >
        <div className="absolute -top-2 left-4 w-12 h-4 rotate-2 masking-tape opacity-90" style={{ backgroundColor: "#CA0000" }} />
        <div className="absolute -top-2 right-4 w-12 h-4 -rotate-2 masking-tape opacity-90" style={{ backgroundColor: "#010193" }} />
        
        <div className="flex justify-between items-start pt-1">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-wider">collage</h1>
            <p className="mt-1 text-sm text-zinc-600 font-bold">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-wider">collage</h1>
            <p className="mt-1 text-sm text-zinc-600 font-bold">
              写真を撮影して、モニターに投稿しよう！
            </p>
          </div>
          {submissionCount > 0 && (
            <div className="bg-zinc-800 text-white px-3 py-1 rounded-sm text-xs font-bold shadow-sm" style={{ transform: "rotate(2deg)" }}>
            <div className="bg-zinc-800 text-white px-3 py-1 rounded-sm text-xs font-bold shadow-sm" style={{ transform: "rotate(2deg)" }}>
              {submissionCount}回目
            </div>
          )}
        </div>
        
        {/* タブ切り替え（手書きノート風） */}
        <div className="mt-4 flex gap-2">
        {/* タブ切り替え（手書きノート風） */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-2 text-sm font-bold border-2 transition-all ${
              activeTab === "create" 
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5" 
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            className={`flex-1 py-2 text-sm font-bold border-2 transition-all ${
              activeTab === "create" 
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5" 
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            }`}
            style={{ borderRadius: "2px 8px 2px 2px" }}
            style={{ borderRadius: "2px 8px 2px 2px" }}
          >
            作成
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2 text-sm font-bold border-2 transition-all relative ${
              activeTab === "history" 
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5" 
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            className={`flex-1 py-2 text-sm font-bold border-2 transition-all relative ${
              activeTab === "history" 
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5" 
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            }`}
            style={{ borderRadius: "8px 2px 2px 2px" }}
            style={{ borderRadius: "8px 2px 2px 2px" }}
          >
            履歴
            {collageHistory.length > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full border border-rose-700"></span>
              <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full border border-rose-700"></span>
            )}
          </button>
        </div>
      </header>

      {/* 選択中テーマの固定表示バー */}
      {activeTab === "create" && !result && (
        <div className="sticky top-3 z-40 pt-1 pb-2">
          <div
            className="rounded-sm px-5 py-4 shadow-[0_6px_16px_rgba(0,0,0,0.15)] transition-all duration-200 relative overflow-hidden backdrop-blur-md"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderColor: selectedTheme ? selectedSlotColor : "#fef08a",
              borderWidth: selectedTheme ? "2px" : "1px",
              borderStyle: "solid",
              transform: "rotate(-1deg)",
            }}
          >
            {/* テープ装飾 */}
            <div 
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 rotate-2 masking-tape opacity-90" 
              style={{ backgroundColor: selectedSlotColor }} 
            />
            
            {selectedTheme ? (
              <div key={selectedSlotId} className="animate-theme-fade text-center mt-1">
                <p className="text-xs font-bold text-zinc-500 mb-1 tracking-wider">テーマ</p>
                <p className="text-lg font-bold text-zinc-800 leading-snug">{selectedTheme}</p>
              <div key={selectedSlotId} className="animate-theme-fade text-center mt-1">
                <p className="text-xs font-bold text-zinc-500 mb-1 tracking-wider">テーマ</p>
                <p className="text-lg font-bold text-zinc-800 leading-snug">{selectedTheme}</p>
                {hasImageInSelected && (
                  <p className="text-[11px] text-emerald-600 font-bold mt-2">✓ 撮影済み — タップで撮り直せます</p>
                  <p className="text-[11px] text-emerald-600 font-bold mt-2">✓ 撮影済み — タップで撮り直せます</p>
                )}
              </div>
            ) : (
              <div className="text-center mt-1">
                <p className="text-sm font-bold text-zinc-600">枠をタップしてテーマを確認 👆</p>
              </div>
              <div className="text-center mt-1">
                <p className="text-sm font-bold text-zinc-600">枠をタップしてテーマを確認 👆</p>
              </div>
            )}
          </div>
        </div>
      )}

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
                    selectedSlotId={selectedSlotId}
                    onSlotSelect={setSelectedSlotId}
                    onLog={pushLog}
                  />
                </section>
              )}

              {/* 進捗インジケーター */}
              {template && (
                <div className="flex items-center justify-center gap-2 py-2 mt-2">
                <div className="flex items-center justify-center gap-2 py-2 mt-2">
                  {template.polygons.map((p, i) => (
                    <div
                      key={p.id}
                      className={`w-3 h-3 rounded-full transition-all duration-200 border-2 ${
                        images[p.id] ? "scale-100 border-transparent" : "scale-75 border-zinc-300 bg-transparent"
                      className={`w-3 h-3 rounded-full transition-all duration-200 border-2 ${
                        images[p.id] ? "scale-100 border-transparent" : "scale-75 border-zinc-300 bg-transparent"
                      }`}
                      style={{
                        backgroundColor: images[p.id]
                          ? SLOT_COLORS[i % SLOT_COLORS.length]
                          : "transparent",
                        transform: images[p.id] ? `rotate(${Math.random() * 20 - 10}deg)` : "none",
                          : "transparent",
                        transform: images[p.id] ? `rotate(${Math.random() * 20 - 10}deg)` : "none",
                      }}
                    />
                  ))}
                  <span className="ml-3 text-sm text-zinc-500 font-bold tracking-widest border-b-2 border-zinc-300 pb-0.5">
                  <span className="ml-3 text-sm text-zinc-500 font-bold tracking-widest border-b-2 border-zinc-300 pb-0.5">
                    {template.polygons.filter(p => images[p.id]).length}/{template.polygons.length}
                  </span>
                </div>
              )}

              {/* 投稿ボタン（全枠撮影済みの場合のみ表示） */}
              {allFilled && (
                <section className="mt-2">
                <section className="mt-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="w-full py-4 rounded-sm bg-zinc-800 text-white font-bold shadow-[4px_4px_0_0_rgba(0,0,0,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:bg-zinc-400 disabled:shadow-none disabled:cursor-not-allowed border-2 border-zinc-900"
                    style={{ transform: "rotate(-1deg)" }}
                    className="w-full py-4 rounded-sm bg-zinc-800 text-white font-bold shadow-[4px_4px_0_0_rgba(0,0,0,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:bg-zinc-400 disabled:shadow-none disabled:cursor-not-allowed border-2 border-zinc-900"
                    style={{ transform: "rotate(-1deg)" }}
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        投稿中...
                      </span>
                    ) : "🎉 作品をモニターに送る"}
                  </button>
                </section>
              )}

              {errorMessage && (
                <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-100 animate-pulse">
                  ⚠️ {errorMessage}
                </p>
              )}
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

      {/* 下部固定カメラボタン — 枠選択中かつ作成タブかつ未投稿時のみ表示 */}
      {activeTab === "create" && !result && selectedSlotId && template && (
        <div className="fixed bottom-0 left-0 right-0 z-20 animate-bar-slide-up pb-5">
          <div className="mx-auto max-w-md px-4 pt-3 flex justify-center">
        <div className="fixed bottom-0 left-0 right-0 z-20 animate-bar-slide-up pb-5">
          <div className="mx-auto max-w-md px-4 pt-3 flex justify-center">
            <button
              onClick={() => setIsCameraOpen(true)}
              className="w-[90%] h-14 font-bold text-sm shadow-[2px_4px_0_0_rgba(0,0,0,0.2)] active:translate-y-1 active:translate-x-0.5 active:shadow-none transition-all flex items-center justify-center gap-2 border-2 border-black"
              style={{ 
                backgroundColor: selectedSlotColor, 
                color: getContrastColor(selectedSlotColor),
                transform: "rotate(1deg)" 
              }}
              className="w-[90%] h-14 font-bold text-sm shadow-[2px_4px_0_0_rgba(0,0,0,0.2)] active:translate-y-1 active:translate-x-0.5 active:shadow-none transition-all flex items-center justify-center gap-2 border-2 border-black"
              style={{ 
                backgroundColor: selectedSlotColor, 
                color: getContrastColor(selectedSlotColor),
                transform: "rotate(1deg)" 
              }}
            >
              <span className="text-xl">📸</span>
              <span className="tracking-widest">{hasImageInSelected ? "撮り直す" : "カメラを起動して撮影"}</span>
              <span className="text-xl">📸</span>
              <span className="tracking-widest">{hasImageInSelected ? "撮り直す" : "カメラを起動して撮影"}</span>
            </button>
          </div>
        </div>
      )}

      {/* アプリ内カメラオーバーレイ */}
      {isCameraOpen && selectedSlotId && selectedTheme && template && (
        <CameraScreen
          theme={selectedTheme}
          capturedCount={template.polygons.filter(p => images[p.id]).length}
          totalCount={template.polygons.length}
          slotColor={selectedSlotColor}
          onCapture={(dataUrl) => {
            setImageDataUrl(selectedSlotId, dataUrl);
            setIsCameraOpen(false);
          }}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
    </main>
  );
}
