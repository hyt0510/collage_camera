"use client";

import { useEffect, useState } from "react";
import { useMonitorClosed } from "@/hooks/useMonitorClosed";
import { isMonitorClosed } from "@/lib/monitor-schedule";
import { getMonitorPreviewSessionDeadline, isMonitorPreviewSessionExpired } from "@/lib/utils/monitor-preview-session";
import { parseMonitorAtlas, type MonitorAtlas } from "@/lib/utils/monitor-animation";

type PreviewState = {
  imageUrl: string | null;
  updatedAt: number | null;
  atlas: MonitorAtlas | null;
  status: "loading" | "live" | "waiting" | "error" | "closed" | "paused";
};

/** タブを開いている間だけ取得し、ブラウザが非表示の間も通信を止める。 */
export function useMonitorPreview(): PreviewState & { resume: () => void } {
  const closed = useMonitorClosed();
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const deadline = getMonitorPreviewSessionDeadline(startedAt);
  const [preview, setPreview] = useState<PreviewState>({ imageUrl: null, updatedAt: null, atlas:null, status: "loading" });
  useEffect(() => {
    if (closed || isMonitorClosed()) return;
    let cancelled = false;
    let stopped = false;
    let fetching = false;
    let etag: string | null = null;
    let imageUrl: string | null = null;
    let atlas: MonitorAtlas | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let pauseTimer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;

    const clearImage = (status: "waiting" | "error" | "closed") => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = null;
      etag = null;
      atlas = null;
      setPreview({ imageUrl: null, updatedAt: null, atlas:null, status });
    };
    const active = () => {
      if (cancelled || stopped) return false;
      if (isMonitorClosed()) { stopped = true; controller?.abort(); clearImage("closed"); return false; }
      if (isMonitorPreviewSessionExpired(deadline)) {
        stopped = true;
        clearTimeout(timer);
        controller?.abort();
        setPreview((current) => ({ ...current, status: "paused" }));
        return false;
      }
      return true;
    };
    const checkDeadline = () => {
      if (active()) pauseTimer = setTimeout(checkDeadline, Math.max(1, deadline - Date.now()));
    };
    const refresh = async () => {
      if (!active() || document.hidden || fetching) return;
      clearTimeout(timer);
      fetching = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 5_000);
      try {
        const response = await fetch("/api/monitor-preview", {
          headers: etag ? { "If-None-Match": etag } : {},
          signal: controller.signal,
          cache: "no-cache",
        });
        if (!active() || document.hidden) return;
        if (response.status === 410 || isMonitorClosed()) { stopped = true; clearImage("closed"); return; }
        if (response.status === 404) { clearImage("waiting"); return; }
        if (response.status !== 304 && !response.ok) throw new Error("preview failed");
        const updatedAt = Number(response.headers.get("X-Monitor-Updated-At"));
        if (!updatedAt || !Number.isFinite(updatedAt)) throw new Error("invalid preview");
        if (response.status !== 304) {
          let blob = await response.blob();
          if (!active() || document.hidden) return;
          let nextAtlas: MonitorAtlas | null = null;
          if (blob.type === "application/json") {
            if (blob.size > 300_000) throw new Error("invalid preview");
            const body: unknown=JSON.parse(await blob.text());
            if (typeof body !== "object" || body === null) throw new Error("invalid preview");
            const {version,imageDataUrl,atlas:rawAtlas}=body as Record<string,unknown>;
            nextAtlas=parseMonitorAtlas(rawAtlas);
            const match=typeof imageDataUrl === "string" && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
            if (version !== 2 || !nextAtlas || !match) throw new Error("invalid preview");
            const bytes=Uint8Array.from(atob(match[1]),(char)=>char.charCodeAt(0));
            if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("invalid preview");
            blob=new Blob([bytes],{type:"image/jpeg"});
          }
          if (blob.type !== "image/jpeg" || blob.size > 200_000) throw new Error("invalid preview");
          if (!active() || document.hidden) return;
          const nextUrl = URL.createObjectURL(blob);
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          imageUrl = nextUrl;
          etag = response.headers.get("ETag");
          atlas = nextAtlas;
        }
        setPreview({ imageUrl, updatedAt, atlas, status: "live" });
      } catch {
        if (active() && !document.hidden) clearImage("error");
      } finally {
        clearTimeout(timeout);
        fetching = false;
        if (active() && !document.hidden) timer = setTimeout(refresh, Math.min(30_000, Math.max(1, deadline - Date.now())));
      }
    };
    const visibilityChanged = () => {
      clearTimeout(timer);
      if (document.hidden) controller?.abort();
      else void refresh();
    };
    pauseTimer = setTimeout(checkDeadline, Math.max(1, deadline - Date.now()));
    void refresh();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(pauseTimer);
      controller?.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [closed, deadline]);
  const resume = () => {
    if (closed || isMonitorClosed()) return;
    setPreview({ imageUrl: null, updatedAt: null, atlas:null, status: "loading" });
    setStartedAt(Date.now());
  };
  return { ...(closed ? { imageUrl: null, updatedAt: null, atlas:null, status: "closed" as const } : preview), resume };
}
