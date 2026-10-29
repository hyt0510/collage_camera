"use client";

import { useEffect, useState } from "react";
import { getMonitorAnimationState, type MonitorAnimationPhase } from "@/lib/utils/monitor-animation";

/** 周期の境界だけを更新し、写真の取得や枚数変化では周期をリセットしない。 */
export function useMonitorAnimation() {
  const [phase,setPhase]=useState<MonitorAnimationPhase>("scatter");
  useEffect(()=>{
    const startedAt=Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const update=()=>{
      const state=getMonitorAnimationState(Date.now()-startedAt);
      setPhase(state.phase);
      timer=setTimeout(update,state.nextInMs);
    };
    const visibilityChanged=()=>{
      clearTimeout(timer);
      if (!document.hidden) update();
    };
    timer=setTimeout(update,100_000);
    document.addEventListener("visibilitychange",visibilityChanged);
    return ()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",visibilityChanged);};
  },[]);
  return {phase,assembled:phase === "gather" || phase === "hold"};
}
