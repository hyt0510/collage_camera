"use client";

import { useEffect, useRef, useState } from "react";
import { isCorrectRiddleAnswer, type Riddle } from "@/lib/utils/riddles";

interface Props {
  riddle: Riddle;
  onSolved: () => void;
  onClose: () => void;
}

export function RiddleDialog({ riddle, onSolved, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="riddle-title"
      className="fixed inset-0 m-auto max-h-[95dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border-2 border-zinc-800 bg-white p-4 shadow-xl backdrop:bg-black/60"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="riddle-title" className="text-lg font-bold">{riddle.theme}</h2>
        <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm font-bold">閉じる</button>
      </div>
      {/* Word資料から問題全体を画像にして、文字と矢印の位置関係を保つ。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={riddle.image} alt={`${riddle.theme}の問題。画像の謎を解いて答えを入力してください。`} className="h-auto w-full rounded border border-zinc-200" />
      <p className="mt-3 text-sm text-zinc-600">答えを入力すると撮影できます。正解したら、答えの場所やものの写真を撮ろう！</p>
      <form className="mt-4 space-y-3" onSubmit={event => {
        event.preventDefault();
        if (isCorrectRiddleAnswer(riddle, answer)) {
          onSolved();
        } else {
          setError(answer.trim() ? "答えが違うようです。もう一度考えてみよう！" : "答えを入力してください。");
        }
      }}>
        <label htmlFor="riddle-answer" className="block text-sm font-bold">答え（場所・ものの名前）</label>
        <input
          id="riddle-answer"
          value={answer}
          onChange={event => { setAnswer(event.target.value); setError(""); }}
          maxLength={100}
          autoComplete="off"
          placeholder="ひらがなでも入力できます"
          aria-invalid={!!error}
          aria-describedby={error ? "riddle-error" : undefined}
          className="min-h-12 w-full rounded border-2 border-zinc-400 px-3 text-base text-zinc-900 focus:border-zinc-800"
        />
        {error && <p id="riddle-error" role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        <button type="submit" className="min-h-12 w-full rounded bg-zinc-900 px-4 py-3 font-bold text-white">回答する</button>
      </form>
    </dialog>
  );
}
