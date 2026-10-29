"use client";

import { useEffect, useState } from "react";
import { isMonitorClosed, MONITOR_CLOSES_AT } from "@/lib/monitor-schedule";

/** 開いたままの画面も期限に停止し、バックグラウンドから戻ったときにも確認する。 */
export function useMonitorClosed(): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      if (isMonitorClosed()) setClosed(true);
      else timer = setTimeout(check, Math.min(60_000, MONITOR_CLOSES_AT - Date.now()));
    };
    timer = setTimeout(check, 0);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return closed;
}
