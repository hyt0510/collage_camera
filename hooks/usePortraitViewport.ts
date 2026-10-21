"use client";

import { useSyncExternalStore } from "react";
import { getPortraitViewportStyle } from "@/lib/utils/orientation";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  window.screen.orientation?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    window.screen.orientation?.removeEventListener("change", onChange);
  };
}

function getSnapshot() {
  const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
  return `${window.innerWidth},${window.innerHeight},${angle},${window.matchMedia("(pointer: coarse)").matches ? 1 : 0}`;
}

export function usePortraitViewport() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "0,0,0,0");
  const [width, height, angle, touch] = snapshot.split(",").map(Number);
  return getPortraitViewportStyle(width, height, angle, touch === 1);
}
