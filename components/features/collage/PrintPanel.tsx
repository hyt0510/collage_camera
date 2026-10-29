"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { generatePrintImage, PRINT_FORMATS, type PrintFormat } from "@/lib/utils/print";
import { normalizePrintCode } from "@/lib/utils/print-code";

export function PrintPanel({ initialSubmissionId = "", access = "admin" }: { initialSubmissionId?: string; access?: "admin" | "print" }) {
  const canPrint = access === "print" || Boolean(initialSubmissionId);
  const [format, setFormat] = useState<PrintFormat>("L");
  const printFormat = PRINT_FORMATS[format];
  const [submissionId, setSubmissionId] = useState(initialSubmissionId);
  const [preview, setPreview] = useState<{ id: string; dataUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const printImageRef = useRef<HTMLImageElement | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const preparePrint = useCallback(async (requestedId: string, requestedFormat: PrintFormat = "L") => {
    if (requestRef.current) return;
    const id = access === "print" ? normalizePrintCode(requestedId) ?? requestedId.trim() : requestedId.trim();
    setPreview(null);
    sourceImageRef.current = null;
    setError("");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      setError("6文字の受付番号、または作品IDを入力してください。");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    let imageUrl: string | null = null;
    try {
      const imagePath = access === "print" ? `/print/image/${encodeURIComponent(id)}` : `/api/submissions/${encodeURIComponent(id)}/image`;
      const response = await fetch(imagePath, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      }).catch(() => {
        throw new Error("作品を取得できませんでした。通信を確認して再度お試しください。");
      });
      if (response.status === 404) throw new Error("作品が見つかりませんでした。受付番号または作品IDを確認してください。");
      if (response.status === 401 || response.status === 403) throw new Error(access === "print"
        ? "印刷用の認証を確認し、印刷受付を開き直してください。"
        : "管理者認証を確認し、管理画面を開き直してください。");
      if (!response.ok) throw new Error("作品を取得できませんでした。時間をおいて再度お試しください。");

      imageUrl = URL.createObjectURL(await response.blob());
      const image = new Image();
      image.src = imageUrl;
      await image.decode().catch(() => {
        throw new Error("写真を読み込めませんでした。もう一度お試しください。");
      });
      if (requestRef.current !== controller) return;
      if (controller.signal.aborted) throw new Error("読み込みに時間がかかっています。もう一度お試しください。");
      const dataUrl = generatePrintImage(image, requestedFormat);
      sourceImageRef.current = image;
      setPreview({ id, dataUrl });
    } catch (error) {
      if (requestRef.current === controller) {
        setError(controller.signal.aborted
          ? "読み込みに時間がかかっています。もう一度お試しください。"
          : error instanceof Error ? error.message : "印刷画像を作成できませんでした。");
      }
    } finally {
      window.clearTimeout(timeout);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [access]);

  useEffect(() => {
    if (!initialSubmissionId) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void preparePrint(initialSubmissionId); });
    return () => { cancelled = true; };
  }, [initialSubmissionId, preparePrint]);

  function changePrintFormat(nextFormat: PrintFormat) {
    setFormat(nextFormat);
    setError("");
    if (!preview || !sourceImageRef.current) return;
    try {
      setPreview({ id: preview.id, dataUrl: generatePrintImage(sourceImageRef.current, nextFormat) });
    } catch {
      setPreview(null);
      setError("印刷画像を作成できませんでした。作品を開き直してください。");
    }
  }

  async function printImage() {
    const image = printImageRef.current;
    if (!image) return;
    try {
      await image.decode();
      window.print();
    } catch {
      setError("印刷の準備ができませんでした。画像を開き直して再度お試しください。");
    }
  }

  return (
    <section className="collage-print-panel mt-4 border-2 border-[#111111] bg-[#f8f8f8] p-4 shadow-[5px_5px_0_#111111]" aria-labelledby="print-heading">
      {canPrint && format === "L" && (
        <style>{`
          @page { size: 89mm 127mm; margin: 0; }
          @media print {
            html, body { width: 89mm; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; }
            .collage-print-panel, .collage-print-preview { display: block !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
            .collage-print-image { display: block; width: 89mm !important; height: 127mm !important; max-width: none !important; border-radius: 0 !important; box-shadow: none !important; break-inside: avoid; }
          }
        `}</style>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 id="print-heading" className="text-base font-semibold text-zinc-900">作品を印刷する</h2>
        <span className="rounded-full bg-white px-3 py-1 text-xs text-zinc-600">{printFormat.label}・{format === "mini" ? "印画面 " : "縦 "}{printFormat.widthMm} × {printFormat.heightMm} mm</span>
      </div>
      <p className="mt-2 text-sm text-zinc-600 print:hidden">{initialSubmissionId ? "URLの作品を自動で読み込みます。表示されない場合は「作品を開く」を押してください。" : "参加者に作品IDを見せてもらい、印刷するコラージュを開いてください。"}</p>
      <div className="mt-4 print:hidden">
        <label htmlFor="print-format" className="mb-1 block text-sm font-semibold text-zinc-800">印刷サイズ</label>
        <select id="print-format" value={format} disabled={loading} onChange={(event) => changePrintFormat(event.target.value === "mini" ? "mini" : "L")} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 disabled:opacity-60 sm:w-auto">
          <option value="L">L判（89 × 127 mm）</option>
          <option value="mini">チェキmini（印画面 46 × 62 mm）</option>
        </select>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void preparePrint(submissionId, format); }} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end print:hidden">
        <div className="min-w-0 flex-1">
          <label htmlFor="print-submission-id" className="mb-1 block text-sm font-semibold text-zinc-800">{access === "print" ? "受付番号 / 作品ID" : "作品ID"}</label>
          <input
            id="print-submission-id"
            value={submissionId}
            readOnly={Boolean(initialSubmissionId)}
            onChange={(event) => {
              setSubmissionId(event.target.value);
              setPreview(null);
              sourceImageRef.current = null;
              setError("");
            }}
            disabled={loading}
            required
            maxLength={64}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={access === "print" ? "K7M-4PX" : "作品IDを貼り付け"}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 disabled:opacity-60"
          />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-[#1a33d6] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? "印刷画像を準備中…" : "作品を開く"}
        </button>
      </form>
      <div aria-live="polite" aria-busy={loading}>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700 print:hidden">{error}</p>}
        {preview && (
          <div className="collage-print-preview mt-5 grid items-start gap-4 sm:grid-cols-[minmax(0,280px)_1fr]">
            <img ref={printImageRef} src={preview.dataUrl} alt={`ぼかし背景付きの${printFormat.label}印刷プレビュー`} width={Math.round(printFormat.widthMm / 25.4 * 300)} height={Math.round(printFormat.heightMm / 25.4 * 300)} className="collage-print-image h-auto w-full" />
            <div className="min-w-0 space-y-3 text-sm text-zinc-700 print:hidden">
              <p className="font-semibold text-zinc-900">写真を確認してから{canPrint && format === "L" ? "印刷" : "保存"}してください。</p>
              <p className="break-all font-mono text-xs">作品ID：{preview.id}</p>
              <div className="flex flex-wrap gap-2">
                {format === "mini" ? null : canPrint ? (
                  <button type="button" onClick={() => void printImage()} className="rounded-lg bg-[#1a33d6] px-4 py-3 font-semibold text-white">L判で印刷</button>
                ) : (
                  <Link href={`/admin/print/${encodeURIComponent(preview.id)}`} prefetch={false} className="rounded-lg bg-[#1a33d6] px-4 py-3 font-semibold text-white">印刷専用ページを開く</Link>
                )}
                <a href={preview.dataUrl} download={`collage_${preview.id}_${format === "mini" ? "instax-mini" : "L"}.jpg`} className="inline-flex rounded-lg border border-[#111111] bg-[#f4d21f] px-4 py-3 font-semibold text-[#111111]">{printFormat.label}用JPEGを保存</a>
              </div>
              <p>{format === "mini"
                ? "JPEGを端末に保存し、チェキプリンター用アプリ（instax mini Linkなど）で開いて印刷してください。フィルムの白い外枠は含めず、印画面に合わせた画像です。"
                : canPrint ? "印刷設定で用紙を「L判」、向きを「縦」、倍率を「100%」にし、ヘッダーとフッターをオフにしてください。" : "保存した画像を印刷ソフトで開き、用紙を「L判」、向きを「縦」に設定してください。"}</p>
              <p className="text-xs text-zinc-500">写真全体を残し、余白は同じ写真をぼかした背景で埋めています。{format === "mini" ? "アプリで拡大・トリミングせず、" : "プリンターによって端の切れ方が変わるため、"}最初に1枚試し刷りしてください。</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
