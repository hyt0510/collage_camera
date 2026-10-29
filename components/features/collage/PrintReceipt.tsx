"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { fetchPrintCode } from "@/services/api/print";
import { formatPrintCode } from "@/lib/utils/print-code";

export function PrintReceipt({ submissionId, user }: { submissionId: string; user: Pick<User, "getIdToken"> | null }) {
  const [receipt, setReceipt] = useState<{ code: string; qr: string | null } | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function prepare() {
      let code: string | null = null;
      try {
        code = await fetchPrintCode(submissionId, await user!.getIdToken());
        if (cancelled) return;
        setReceipt({ code, qr: null });
        const { toDataURL } = await import("qrcode");
        const qr = await toDataURL(`${window.location.origin}/print/${code}`, { width: 192, margin: 4, errorCorrectionLevel: "M" });
        if (!cancelled) setReceipt({ code, qr });
      } catch (cause) {
        if (!cancelled) setError(code ? "QRを表示できませんでした。受付番号をスタッフに見せてください。" : cause instanceof Error ? cause.message : "受付番号を取得できませんでした。");
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [submissionId, user, attempt]);

  async function copyCode() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(formatPrintCode(receipt.code));
      setCopyMessage("受付番号をコピーしました。");
    } catch { setCopyMessage("番号を長押ししてコピーするか、この画面をスタッフに見せてください。"); }
  }

  return (
    <section aria-label="印刷受付" className="rounded-xl border border-zinc-300 bg-white p-3 text-center text-zinc-900">
      <p className="text-xs font-bold">印刷の受付番号</p>
      {receipt ? <>
        <p className="my-2 select-all font-mono text-3xl font-bold tracking-widest">{formatPrintCode(receipt.code)}</p>
        {receipt.qr && <img src={receipt.qr} width={192} height={192} alt="スタッフ用の印刷QRコード" className="mx-auto h-36 w-36" />}
        <button type="button" onClick={() => void copyCode()} className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-bold">受付番号をコピー</button>
        <p className="mt-2 text-xs">この番号かQRを、印刷スタッフに見せてください。</p>
      </> : !error ? <p role="status" className="py-3 text-sm">受付番号を準備中…</p> : null}
      <p aria-live="polite" className="mt-1 text-xs">{copyMessage}</p>
      {error && <div className="mt-2 text-xs">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }} className="mt-2 rounded-lg border border-zinc-400 px-3 py-2 font-bold">もう一度取得</button>
      </div>}
    </section>
  );
}
