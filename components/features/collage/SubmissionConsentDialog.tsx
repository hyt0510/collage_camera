"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onConfirm: () => void;
  onClose: () => void;
}

/** 投稿ごとに公開範囲と写真の利用条件を確認する。 */
export function SubmissionConsentDialog({ onConfirm, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="submission-consent-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border-2 border-zinc-800 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/60"
    >
      <form
        className="flex max-h-[90dvh] flex-col"
        onSubmit={event => {
          event.preventDefault();
          if (accepted) onConfirm();
        }}
      >
        <header className="shrink-0 border-b border-zinc-200 px-4 py-3">
          <h2 id="submission-consent-title" className="text-lg font-bold">作品を送る前に</h2>
          <p className="mt-1 text-sm text-zinc-600">公開範囲と写真の取り扱いを確認してください。</p>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 text-sm leading-relaxed" tabIndex={0} aria-label="作品の公開と取り扱いについて">
          <section>
            <h3 className="mb-1 font-bold">1. 作品の公開</h3>
            <p>投稿した作品は、参加者向けWebページ「みんなのコラージュ」と、景品交換テントのモニターに表示されます。WebページはURLを知っている人が閲覧でき、画像を保存する可能性があります。公開は2026年11月1日23:59に終了します。</p>
          </section>
          <section>
            <h3 className="mb-1 font-bold">2. 人物が写っている場合</h3>
            <p>写っている人に公開範囲を説明し、了承を得てください。公開について自分で判断することが難しい子どもの写真は、保護者の了承も得てください。名札・学生証・住所などの個人情報は写さないでください。</p>
          </section>
          <section>
            <h3 className="mb-1 font-bold">3. 運営による管理と画像の処理</h3>
            <p>鈴鹿高専祭が投稿を管理し、必要に応じて閲覧・非表示・削除します。保存・管理にはGoogleのサービスを利用し、不適切な画像の判定のためGoogleの画像解析サービスへ送信する場合があります。</p>
          </section>
          <section>
            <h3 className="mb-1 font-bold">4. 作品の利用範囲</h3>
            <p>作品の著作権は撮影者に残ります。運営は、この企画のコラージュ作成・表示・管理に必要な範囲で作品を利用します。広告やSNSへの転載など、別の目的で利用するときは改めて確認します。</p>
          </section>
          <section>
            <h3 className="mb-1 font-bold">5. 保存期限と削除の相談</h3>
            <p>運営が保存する投稿画像は、2026年11月2日中に削除します。ご自身の端末や閲覧者が保存した画像は残る場合があります。</p>
            <p className="mt-2">公開停止・削除のご相談は、<a href="https://www.snct-fes.info/" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-800 underline underline-offset-2">鈴鹿高専祭公式HP（別タブ）</a>末尾のメールリンクからお問い合わせください。</p>
          </section>
        </div>

        <footer className="shrink-0 space-y-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              required
              checked={accepted}
              onChange={event => setAccepted(event.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-zinc-900"
            />
            <span>上記に同意し、人物が写っている場合は、その人からも公開の了承を得ています。</span>
          </label>
          <div className="flex gap-3">
            <button type="button" autoFocus onClick={onClose} className="min-h-12 rounded border-2 border-zinc-500 bg-white px-4 py-2 text-sm font-bold">戻る</button>
            <button type="submit" disabled={!accepted} className="min-h-12 flex-1 rounded border-2 border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-600">同意して作品を送る</button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
