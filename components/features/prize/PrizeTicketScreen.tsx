"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/utils/prize";

interface Props {
  /** OK の画面を出せる期限（このスマホの時刻） */
  until: number;
  redeemedAt: string;
  onClose: () => void;
}

/**
 * スタッフに見せる「景品交換OK」の全画面。
 * スクリーンショットと見分けられるよう、現在時刻を秒まで動かし、期限が来たら表示を切り替える
 */
export function PrizeTicketScreen({ until, redeemedAt, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = until - now;
  const active = remainingMs > 0;
  const clock = new Date(now).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const redeemedTime = new Date(redeemedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center text-white ${
        active ? "bg-emerald-600" : "bg-zinc-800"
      }`}
    >
      {active ? (
        <>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
            <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white text-5xl font-bold text-emerald-600">
              ✓
            </span>
          </div>
          <div>
            <p className="text-4xl font-bold tracking-wider">景品交換OK</p>
            <p className="mt-2 text-base font-bold">ガチャを1回まわしてください</p>
          </div>
          <p className="font-mono text-5xl font-bold tabular-nums">{clock}</p>
          <p className="text-sm">
            交換 {redeemedTime} ／ この画面はあと {formatRemaining(remainingMs)} 有効
          </p>
          <p className="text-xs text-white/80">この画面を本部スタッフに見せてください</p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold">この画面の有効期限が切れました</p>
          <p className="text-base">景品交換済み {redeemedTime}</p>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full max-w-xs py-3 rounded-xl bg-white/15 border border-white/40 font-bold"
      >
        閉じる
      </button>
    </div>
  );
}
