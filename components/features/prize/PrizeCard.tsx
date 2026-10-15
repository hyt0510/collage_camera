"use client";

import type { PrizeStatusResponse } from "@/services/api/prize";

interface Props {
  status: PrizeStatusResponse | null;
  redeeming: boolean;
  message: string;
  /** 「景品交換OK」の画面をまだ出せるか */
  canShowTicket: boolean;
  onScan: () => void;
  onShowTicket: () => void;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

/**
 * 履歴タブの先頭に出す景品交換のカード。未投稿・交換前・交換済みで表示を変える
 */
export function PrizeCard({ status, redeeming, message, canShowTicket, onScan, onShowTicket }: Props) {
  // 状態を取得するまでは何も出さない（「対象外」と誤って見せないため）。ただし交換の失敗は必ず見せる
  if (!status && !message) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-zinc-100">
      <h3 className="text-sm font-bold text-zinc-800">景品交換（本部テントのガチャ）</h3>

      {!status ? null : status.redeemedAt ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-white">
            景品交換済み {formatTime(status.redeemedAt)}
          </p>
          {canShowTicket && (
            <button
              type="button"
              onClick={onShowTicket}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold active:scale-95 transition-all shadow-sm"
            >
              交換OKの画面をもう一度出す
            </button>
          )}
        </div>
      ) : status.eligible ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-zinc-600 leading-relaxed">
            本部テントでガチャを1回まわせます。本部に貼ってあるQRコードを読み取り、出た画面をスタッフに見せてください。
          </p>
          <button
            type="button"
            onClick={onScan}
            disabled={redeeming}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all shadow-sm disabled:opacity-60"
          >
            {redeeming ? "確認中..." : "本部のQRコードを読み取る"}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
          コラージュを1枚投稿すると、本部テントでガチャを1回まわせます。
        </p>
      )}

      {message && <p className="mt-2 text-xs font-bold text-rose-700">{message}</p>}
    </div>
  );
}
