"use client";

import { useState } from "react";

interface Props {
  messages: string[];
}

/**
 * まだ解除していないロック枠の数を1行で出し、タップで解除場所の一覧を重ねて開く
 * （一覧は重ねて表示するので、開いてもフレームの位置はずれない）
 */
export function LockedSlotsChip({ messages }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-30 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between rounded-sm bg-white px-3 py-1.5 border-2 border-dashed border-zinc-400 text-xs font-bold text-zinc-800"
      >
        <span>🔒 QRコードで開く枠：あと{messages.length}つ</span>
        <span className="text-zinc-500">{open ? "▴ 閉じる" : "▾ 場所を見る"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-sm bg-white px-4 py-3 border-2 border-zinc-800 shadow-[3px_3px_0_0_rgba(0,0,0,0.2)]">
          <p className="text-[11px] font-bold text-zinc-500">撮る順番は自由です。ほかの枠から先に撮れます</p>
          <ul className="mt-2 space-y-1">
            {messages.map((message) => (
              <li key={message} className="text-xs text-zinc-700 leading-relaxed">
                ・{message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
