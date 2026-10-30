import type { CSSProperties } from "react";

/** 横向きのスマホでも、参加者画面の上辺を端末の上辺に合わせる。 */
export function getPortraitViewportStyle(
  width: number, height: number, angle: number, touch: boolean,
): CSSProperties | undefined {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  if (!touch || width <= height || (normalizedAngle !== 90 && normalizedAngle !== 270)) return;
  return {
    position: "fixed", left: "50%", top: "50%", margin: 0,
    width: height, height: width, minHeight: 0, maxWidth: "none",
    overflowY: "auto",
    transform: `translate(-50%, -50%) rotate(${normalizedAngle === 90 ? -90 : 90}deg)`,
  };
}
