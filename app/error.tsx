"use client";

import { useEffect } from "react";
import { IMAGES_KEY, PRESET_KEY } from "@/hooks/useCollageCapture";

/**
 * 予期しないエラーで画面が真っ白にならないよう、やり直す手段を出す
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // 撮影途中のデータが原因のことがあるため、それを捨てて読み込み直す（履歴とQRの解除状態は残す）
  const restart = () => {
    try {
      localStorage.removeItem(IMAGES_KEY);
      localStorage.removeItem(PRESET_KEY);
    } catch {
      // ストレージが使えない環境でも読み込み直しは行う
    }
    window.location.href = "/";
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-4 bg-zinc-50">
      <div className="w-full rounded-sm bg-white p-6 text-center border-2 border-zinc-800 shadow-[4px_4px_0_0_rgba(0,0,0,0.2)]">
        <p className="text-lg font-bold text-zinc-900">うまく表示できませんでした</p>
        <p className="mt-2 text-sm text-zinc-600">
          もう一度試すか、それでも直らなければ「最初からやり直す」を押してください。
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="w-full py-3 bg-zinc-800 text-white font-bold text-sm border-2 border-zinc-900"
          >
            もう一度試す
          </button>
          <button
            type="button"
            onClick={restart}
            className="w-full py-3 bg-white text-zinc-800 font-bold text-sm border-2 border-zinc-800"
          >
            最初からやり直す（撮影中の写真は消えます）
          </button>
        </div>
      </div>
    </main>
  );
}
