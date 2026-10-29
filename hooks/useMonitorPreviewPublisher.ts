"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createMonitorPreview } from "@/lib/utils/monitor-preview";
import { isMonitorClosed } from "@/lib/monitor-schedule";

/** 会場端末だけが全体画像を作る。再取得した個別画像を参加者へ配らない。 */
export function useMonitorPreviewPublisher(container: RefObject<HTMLElement | null>, sourceKey: string | null) {
  const lastAttempt = useRef(0);
  const stopped = useRef(false);
  const [message, setMessage] = useState("共有用プレビューを準備中");

  useEffect(() => {
    if (!sourceKey || stopped.current || isMonitorClosed()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const publish = async () => {
      if (stopped.current || isMonitorClosed()) return;
      lastAttempt.current = Date.now();
      const requestController = new AbortController();
      controller = requestController;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (!container.current) return;
        const element = container.current;
        await Promise.race([
          (async () => {
            const preview = await createMonitorPreview(element);
            if (cancelled || requestController.signal.aborted || isMonitorClosed()) return;
            const response = await fetch("/api/monitor-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(preview),
              signal: requestController.signal,
            });
            if (response.status === 410) {
              stopped.current = true;
              if (!cancelled) setMessage("モニターの公開は終了しました。");
              return;
            }
            if (response.headers.get("X-Monitor-Publishing-Stopped") === "true") {
              stopped.current = true;
              if (!cancelled) setMessage("共有用プレビューの更新上限に達しました。会場画面の表示は継続します。");
              return;
            }
            if (!response.ok) throw new Error("publish failed");
          })(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => { requestController.abort(); reject(new Error("timeout")); }, 5_000);
          }),
        ]);
        if (!cancelled && !stopped.current) setMessage("共有用プレビューを更新中（60秒間隔）");
      } catch {
        if (!cancelled) setMessage("共有用プレビューを更新できません。60秒後に再試行します。");
      } finally {
        clearTimeout(timeout);
        if (!cancelled && !stopped.current && !isMonitorClosed()) timer = setTimeout(publish, 60_000);
      }
    };
    timer = setTimeout(publish, Math.max(0, lastAttempt.current + 60_000 - Date.now()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [container, sourceKey]);

  return message;
}
