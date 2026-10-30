"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCollageCapture } from "@/hooks/useCollageCapture";
import { CollageFrame } from "@/components/features/collage/CollageFrame";
import { PrintReceipt } from "@/components/features/collage/PrintReceipt";
import { MonitorPanel } from "@/components/features/collage/MonitorPanel";
import { CameraScreen } from "@/components/features/camera/CameraScreen";
import { QrScannerScreen } from "@/components/features/camera/QrScannerScreen";
import { CollageBackground } from "@/components/features/collage/CollageBackground";
import { CapturePanel } from "@/components/features/collage/CapturePanel";
import { RiddleDialog } from "@/components/features/collage/RiddleDialog";
import { findRiddleByTheme, getRiddleUnlockId } from "@/lib/utils/riddles";
import { getCapturePanelMode } from "@/lib/utils/capture-panel";
import { getSlotLockId, getSlotLockMessage, getUnlockMessageByLockId, getPresetById } from "@/lib/collage-config";
import { findNextSlotId } from "@/lib/utils/slots";
import { parseUnlockCode } from "@/lib/utils/qr";
import { usePrize } from "@/hooks/usePrize";
import { PrizeCard } from "@/components/features/prize/PrizeCard";
import { PrizeTicketScreen } from "@/components/features/prize/PrizeTicketScreen";
import { parsePrizeCode } from "@/lib/utils/prize";

export default function Home() {
  const { user, loading: authLoading, error: authError } = useAuth();

  const {
    template, themeMap, images, errorMessage,
    submitting, preparing, result, collageDataUrl, collageHistory,
    hasUnreadHistory, markHistoryRead, unlockedQRs, setUnlockedQRs, presetId,
    setImageDataUrl, submit, reset, pushLog
  } = useCollageCapture(user);

  const [activeTab, setActiveTab] = useState<"create" | "history" | "monitor">("create");

  // OS のカメラで本部の QR を読んで開かれたときは、交換の結果が出る履歴タブを見せる
  const showHistoryTab = useCallback(() => setActiveTab("history"), []);
  const prize = usePrize(user, result?.id ?? null, showHistoryTab);
  const [isPrizeScannerOpen, setIsPrizeScannerOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const collageFrameRef = useRef<HTMLDivElement>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isRiddleOpen, setIsRiddleOpen] = useState(false);

  // 選択中のテーマ情報
  const selectedTheme = selectedSlotId ? themeMap[selectedSlotId] ?? null : null;
  const selectedRiddle = findRiddleByTheme(selectedTheme);
  const hasImageInSelected = selectedSlotId ? !!images[selectedSlotId] : false;

  // 選択中スロットの色（テープの色）
  const SLOT_COLORS = ["#CA0000", "#010193", "#E3C91D", "#1E1E1E", "#F5F3EE"];
  const selectedSlotIndex = template?.polygons.findIndex(p => p.id === selectedSlotId) ?? -1;
  const selectedSlotColor = selectedSlotIndex >= 0 ? SLOT_COLORS[selectedSlotIndex % SLOT_COLORS.length] : "#CA0000";

  // ロック判定
  const totalSlots = template?.polygons.length ?? 0;
  const lockId = template && presetId && selectedSlotIndex >= 0
    ? (selectedRiddle ? getRiddleUnlockId(presetId, selectedSlotIndex, selectedRiddle) : getSlotLockId(presetId, selectedSlotIndex)) : null;
  const isLocked = lockId ? !unlockedQRs.includes(lockId) : false;
  const lockMessage = presetId && selectedSlotIndex >= 0 ? getSlotLockMessage(presetId, selectedSlotIndex) : null;

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 解除コードを適用する（URL の ?unlock= と、アプリ内での QR 読み取りの両方から使う）
  const applyUnlockCode = useCallback((unlockVal: string): "unlocked" | "already" | "invalid" => {
    const preset = presetId ? getPresetById(presetId) : null;
    if (preset?.randomThemes && Object.values(themeMap).some(theme => findRiddleByTheme(theme))) return "invalid";
    const isValid = preset?.slotLocks ? Object.values(preset.slotLocks).includes(unlockVal) : false;
    if (!isValid) return "invalid";
    if (unlockedQRs.includes(unlockVal)) return "already";

    setUnlockedQRs(prev => {
      const next = [...prev];
      if (!next.includes(unlockVal)) {
        next.push(unlockVal);
      }
      return next;
    });

    let friendlyName = `QRコード ${unlockVal}`;
    if (unlockVal.includes("_")) {
      const parts = unlockVal.split("_");
      friendlyName = `${parts[0]}枚コラージュの「QRコード ${parts[1] === "1" ? "A" : "B"}」`;
    }

    const customUnlockMsg = getUnlockMessageByLockId(unlockVal);
    if (customUnlockMsg) {
      setToastMessage(`🔑 ${customUnlockMsg}`);
    } else {
      setToastMessage(`🔑 ${friendlyName} を読み取り、枠を開放しました！`);
    }
    setTimeout(() => setToastMessage(null), 4000);
    return "unlocked";
  }, [presetId, themeMap, unlockedQRs, setUnlockedQRs, setToastMessage]);

  // アプリ内で読み取った QR を処理する。使えないときは読み取り画面に出すエラー文言を返す
  const handleQrDetected = (text: string): string | null => {
    const code = parseUnlockCode(text);
    if (!code && parsePrizeCode(text)) return "景品交換のQRコードです。「履歴」タブの景品交換から読み取ってください";
    if (!code) return "このQRコードは使えません";
    // 読み取りは選択中のロック枠から開くので、その枠の QR 以外では解除しない
    if (lockId && code !== lockId) {
      return `別のテーマのQRコードです。${lockMessage ?? "この枠のQRコードをスキャンしてください"}`;
    }
    const outcome = applyUnlockCode(code);
    if (outcome === "invalid") return "このQRコードは現在のテーマでは使用できません";
    if (outcome === "already") {
      setToastMessage("この枠はすでに開いています");
      setTimeout(() => setToastMessage(null), 4000);
    }
    setIsScannerOpen(false);
    return null;
  };

  // 本部テントの QR を読んだら交換する。結果は履歴タブのカードと OK の画面に出す
  const handlePrizeQrDetected = (text: string): string | null => {
    const code = parsePrizeCode(text);
    if (!code) return "本部テントの景品交換QRコードを読み取ってください";
    setIsPrizeScannerOpen(false);
    void prize.redeem(code);
    return null;
  };

  // URLの ?unlock=... パラメータと ?lock=... パラメータを監視
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const unlockVal = params.get("unlock");
      const lockVal = params.get("lock");

      // presetId がロードされるまで待機（初期ロード中のみ）
      if (unlockVal && !presetId) return;

      if (unlockVal) {
        if (applyUnlockCode(unlockVal) === "invalid") {
          setToastMessage("このQRコードは現在のテーマでは使用できません");
          setTimeout(() => setToastMessage(null), 4000);
        }

        params.delete("unlock");
        const newSearch = params.toString();
        const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState({}, "", newPath);
      } else if (lockVal) {
        if (lockVal === "all") {
          setUnlockedQRs([]);
          setToastMessage("すべてのロックをリセットしました（デバッグ）");
        } else {
          setUnlockedQRs(prev => prev.filter(id => id !== lockVal));
          setToastMessage(`ロック「${lockVal}」をリセットしました（デバッグ）`);
        }
        setTimeout(() => setToastMessage(null), 4000);
        
        params.delete("lock");
        const newSearch = params.toString();
        const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState({}, "", newPath);
      }
    }
  }, [applyUnlockCode, setUnlockedQRs, presetId]);

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
  const panelMode = getCapturePanelMode({ hasSelection: !!selectedSlotId && !!template, isLocked, allFilled });

  const handleSaveImage = async (e: React.MouseEvent<HTMLAnchorElement>, dataUrl: string) => {
    if (navigator.share) {
      e.preventDefault();
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `collage_${new Date().getTime()}.jpg`, { type: "image/jpeg" });
        await navigator.share({
          files: [file],
          title: "コラージュ画像",
        });
      } catch (err) {
        console.error("Share failed, opening in new tab:", err);
        window.open(dataUrl, "_blank");
      }
    }
  };

  return (
    // 作成タブ（完了画面を含む）は画面の高さちょうどに収める。小さい端末では main の中でスクロールする
    <main
      className={`relative mx-auto flex w-full max-w-md flex-col gap-2 px-4 py-3 bg-zinc-50 ${
        activeTab === "create" ? "h-dvh overflow-y-auto" : "min-h-dvh"
      }`}
    >
      <CollageBackground variant="minimal" />

      {/* トースト表示 */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm bg-zinc-900 text-white px-4 py-3 rounded-sm border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] text-center text-sm font-bold animate-popup">
          {toastMessage}
        </div>
      )}
      {/* ヘッダー（一画面に収めるため1行にまとめる） */}
      <header
        className="shrink-0 rounded-sm bg-zinc-50 px-3 py-2 shadow-[2px_2px_0_0_rgba(0,0,0,0.1)] border border-zinc-200 relative z-10 flex flex-wrap items-center justify-between gap-2"
        style={{ transform: "rotate(-0.5deg)" }}
      >
        <div className="absolute -top-1.5 left-4 w-10 h-3 rotate-2 masking-tape opacity-90" style={{ backgroundColor: "#CA0000" }} />

        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-zinc-900 tracking-wider">collage</h1>
        </div>

        {/* タブ切り替え（手書きノート風） */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab("create")}
            className={`w-16 py-1 text-xs font-bold border-2 transition-all ${
              activeTab === "create" 
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5" 
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            }`}
            style={{ borderRadius: "2px 8px 2px 2px" }}
          >
            作成
          </button>
          <button
            onClick={() => {
              setActiveTab("history");
              markHistoryRead();
            }}
            className={`w-16 py-1 text-xs font-bold border-2 transition-all relative ${
              activeTab === "history" 
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5" 
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            }`}
            style={{ borderRadius: "8px 2px 2px 2px" }}
          >
            履歴
            {hasUnreadHistory && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border border-rose-700"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("monitor")}
            className={`w-16 py-1 text-xs font-bold border-2 transition-all ${
              activeTab === "monitor"
                ? "bg-white border-zinc-800 text-zinc-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] -translate-y-0.5"
                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
            }`}
            style={{ borderRadius: "2px 8px 2px 2px" }}
          >
            モニター
          </button>
        </div>
      </header>

      {activeTab === "create" ? (
        <>
          {result ? (
            // 完了画面は受付番号・写真・操作ボタンをカード内に収める。
            <section className="flex shrink-0 flex-col gap-3 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900 border border-indigo-200 shadow-sm animate-in fade-in zoom-in duration-300 relative z-10">
              <div className="shrink-0">
                <h2 className="text-lg font-semibold text-indigo-950 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">✓</span>
                  投稿完了！
                </h2>
                {result.status === "pending_manual" && (
                  <p className="mt-1 text-xs text-indigo-700">
                    運営スタッフが確認したあと、モニターに表示されます。
                  </p>
                )}
              </div>

              {collageDataUrl && (
                <div className="relative flex shrink-0 justify-center">
                  <img
                    src={collageDataUrl}
                    alt="Your Collage"
                    className="block h-auto w-full rounded-lg shadow-md border-2 border-white"
                  />
                  <div className="absolute bottom-2 right-2 max-w-[90%]">
                    <PrintReceipt key={result.id} submissionId={result.id} user={user} identifierOnly />
                  </div>
                </div>
              )}

              {errorMessage && <p role="alert" className="text-sm font-bold text-rose-700">{errorMessage}</p>}
              <div className="shrink-0 flex gap-2">
                {collageDataUrl && (
                  <a
                    href={collageDataUrl}
                    download={`collage_${new Date().getTime()}.jpg`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => handleSaveImage(e, collageDataUrl)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-indigo-600 rounded-xl font-bold border-2 border-indigo-100 hover:bg-indigo-50 active:scale-95 transition-all shadow-sm cursor-pointer"
                  >
                    <span>画像を保存</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  </a>
                )}
                <button
                  onClick={reset}
                  disabled={preparing}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all shadow-sm disabled:opacity-50"
                >
                  {preparing ? "お題を準備中..." : "もう一度作成"}
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* フレームは残った高さに合わせて縮む。小さい端末では 320px で止めてスクロールさせる */}
              {template && (
                <section className="relative z-10 flex flex-1 min-h-[320px] flex-col items-center gap-1">
                  <div className="flex-1 min-h-0 w-full">
                    <CollageFrame
                      frameRef={collageFrameRef}
                      template={template}
                      images={images}
                      themeMap={themeMap}
                      selectedSlotId={selectedSlotId}
                      onSlotSelect={setSelectedSlotId}
                      onLog={pushLog}
                      unlockedQRs={unlockedQRs}
                      presetId={presetId}
                    />
                  </div>

                  {/* 進捗インジケーター */}
                  <div className="shrink-0 flex items-center justify-center gap-2">
                    {template.polygons.map((p, i) => (
                      <div
                        key={p.id}
                        className={`w-2.5 h-2.5 rounded-full transition-all duration-200 border-2 ${
                          images[p.id] ? "scale-100 border-transparent" : "scale-75 border-zinc-300 bg-transparent"
                        }`}
                        style={{
                          backgroundColor: images[p.id]
                            ? SLOT_COLORS[i % SLOT_COLORS.length]
                            : "transparent",
                          transform: images[p.id] ? `rotate(${Math.random() * 20 - 10}deg)` : "none",
                        }}
                      />
                    ))}
                    <span className="ml-2 text-xs text-zinc-500 font-bold tracking-widest">
                      {template.polygons.filter(p => images[p.id]).length}/{template.polygons.length}
                    </span>
                  </div>
                </section>
              )}

              {/* お題・撮影ボタン・投稿ボタンを下部の1か所にまとめる */}
              <CapturePanel
                mode={panelMode}
                theme={selectedRiddle ? "謎解き" : selectedTheme}
                slotColor={selectedSlotColor}
                buttonTextColor={getContrastColor(selectedSlotColor)}
                hasImage={hasImageInSelected}
                lockMessage={lockMessage}
                submitting={submitting}
                errorMessage={errorMessage}
                onOpenCamera={() => setIsCameraOpen(true)}
                onSubmit={submit}
                onScanQr={() => selectedRiddle ? setIsRiddleOpen(true) : setIsScannerOpen(true)}
                isRiddle={!!selectedRiddle}
              />
            </>
          )}
        </>
      ) : activeTab === "monitor" ? (
        <MonitorPanel />
      ) : (
        <section className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 relative z-10">
          <PrizeCard
            status={prize.status}
            redeeming={prize.redeeming}
            message={prize.message}
            canShowTicket={prize.canShowTicket}
            onScan={() => setIsPrizeScannerOpen(true)}
            onShowTicket={prize.openTicket}
          />

          <h2 className="text-lg font-bold text-zinc-800 px-2">作成したコラージュ</h2>
          
          {collageHistory.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center border border-dashed border-zinc-300">
              <p className="text-zinc-400 text-sm">履歴がありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {collageHistory.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm border border-zinc-100">
                  <div className="relative mb-3">
                    <img
                      src={item.dataUrl}
                      alt={`Collage ${item.id}`}
                      className="w-full h-auto rounded-lg shadow-sm"
                    />
                    <div className="absolute bottom-2 right-2 max-w-[90%]">
                      <PrintReceipt submissionId={item.id} user={user} identifierOnly />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-[10px] text-zinc-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    <a
                      href={item.dataUrl}
                      download={`collage_${new Date().getTime()}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleSaveImage(e, item.dataUrl)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                      保存
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* アプリ内での QR 読み取り */}
      {isScannerOpen && (
        <QrScannerScreen onDetect={handleQrDetected} onClose={() => setIsScannerOpen(false)} />
      )}

      {isRiddleOpen && selectedRiddle && lockId && createPortal(
        <RiddleDialog
          key={lockId}
          riddle={selectedRiddle}
          onClose={() => setIsRiddleOpen(false)}
          onSolved={() => {
            setUnlockedQRs(previous => previous.includes(lockId) ? previous : [...previous, lockId]);
            setIsRiddleOpen(false);
            setToastMessage(`正解！${selectedRiddle.answer}の写真を撮ろう！`);
            setTimeout(() => setToastMessage(null), 4000);
          }}
        />,
        document.body,
      )}

      {/* 本部テントの景品交換 QR の読み取り */}
      {isPrizeScannerOpen && (
        <QrScannerScreen onDetect={handlePrizeQrDetected} onClose={() => setIsPrizeScannerOpen(false)} />
      )}

      {/* スタッフに見せる「景品交換OK」の画面 */}
      {prize.isTicketOpen && prize.ticketUntil !== null && prize.status?.redeemedAt && (
        <PrizeTicketScreen
          until={prize.ticketUntil}
          redeemedAt={prize.status.redeemedAt}
          isReshow={prize.isReshow}
          onClose={prize.closeTicket}
        />
      )}

      {/* アプリ内カメラオーバーレイ */}
      {isCameraOpen && selectedSlotId && selectedTheme && template && createPortal(
        <CameraScreen
          getTargetRect={() => {
            const frame = collageFrameRef.current;
            if (!frame) return null;
            const rect = frame.getBoundingClientRect();
            return { left: rect.left + frame.clientLeft, top: rect.top + frame.clientTop,
              width: frame.clientWidth, height: frame.clientHeight };
          }}
          theme={selectedRiddle ? "謎解き" : selectedTheme}
          capturedCount={template.polygons.filter(p => images[p.id]).length}
          totalCount={template.polygons.length}
          slotColor={selectedSlotColor}
          clipPath={template.polygons.find(p => p.id === selectedSlotId)?.clipPath || ""}
          onCapture={(dataUrl) => {
            setImageDataUrl(selectedSlotId, dataUrl);
            setIsCameraOpen(false);
            // 次の未撮影・未ロックの枠へ進む（ほかの枠はタップで選び直せる）。なければ選択を外して投稿ボタンを見せる
            const nextSlotId = findNextSlotId(
              template.polygons.map(p => p.id),
              selectedSlotId,
              (id) => {
                const index = template.polygons.findIndex(p => p.id === id);
                const riddle = findRiddleByTheme(themeMap[id]);
                const slotLockId = presetId ? (riddle ? getRiddleUnlockId(presetId, index, riddle) : getSlotLockId(presetId, index)) : null;
                return !images[id] && !(slotLockId && !unlockedQRs.includes(slotLockId));
              },
            );
            setSelectedSlotId(nextSlotId);
          }}
          onClose={() => setIsCameraOpen(false)}
        />,
        document.body,
      )}
    </main>
  );
}
