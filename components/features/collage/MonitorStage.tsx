"use client";

import type { RefObject } from "react";
import { useMonitorAnimation } from "@/hooks/useMonitorAnimation";
import { getMonitorTileLayout, type MonitorAtlas, type MonitorPlacement } from "@/lib/utils/monitor-animation";

export type MonitorStageItem = MonitorPlacement & { imageUrl?: string; submissionId?: string };

export function MonitorStage({items,atlas,stageRef}: {
  items: MonitorStageItem[];
  atlas?: MonitorAtlas & {imageUrl:string};
  stageRef?: RefObject<HTMLElement | null>;
}) {
  const {phase,assembled}=useMonitorAnimation();
  return (
    <section ref={stageRef} role="img" aria-label="会場モニターに集まったコラージュ全体" data-monitor-phase={phase}
      className="relative isolate aspect-video w-full overflow-hidden [container-type:size]">
      {items.length === 0 && <p className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-zinc-500">写真が届くのを待っています。</p>}
      {items.map((item,index)=>{
        const letter=getMonitorTileLayout(item,true,items.length);
        const scattered=getMonitorTileLayout(item,false,items.length);
        const column=atlas ? index % atlas.columns : 0;
        const row=atlas ? Math.floor(index / atlas.columns) : 0;
        return (
          <div key={`${item.row}-${item.col}`} data-monitor-cell="" data-monitor-row={item.row} data-monitor-col={item.col} data-monitor-submission-id={item.submissionId}
            className="absolute transition-transform duration-[4000ms] ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none"
            style={{left:`${(letter.x-letter.width/2)*100}%`,top:`${(letter.y-letter.width*16/9/2)*100}%`,width:`${letter.width*100}%`,height:`${letter.width*16/9*100}%`,
              transform:assembled ? "translate(0cqw,0cqh) scale(1)" : `translate(${(scattered.x-letter.x)*100}cqw,${(scattered.y-letter.y)*100}cqh) scale(${scattered.width/letter.width})`}}>
            <div className="h-full w-full bg-white shadow-[1px_2px_4px_rgba(0,0,0,.15)]" style={{transform:`rotate(${letter.rotation}deg)`,padding:"max(0.35px,0.06cqw)"}}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover"/> : atlas && (
                <div className="h-full w-full" style={{backgroundImage:`url("${atlas.imageUrl}")`,backgroundSize:`${atlas.columns*100}% ${atlas.rows*100}%`,backgroundPosition:`${column/Math.max(1,atlas.columns-1)*100}% ${row/Math.max(1,atlas.rows-1)*100}%`}}/>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
