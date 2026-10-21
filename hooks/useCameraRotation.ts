"use client";

import { useSyncExternalStore } from "react";
import { getCameraRotationCorrection, watchCameraOrientation } from "@/lib/utils/camera";

function getAngle() {
  return window.screen.orientation?.angle ?? window.orientation ?? 0;
}

export function useCameraRotation(facing: "user" | "environment") {
  const angle = useSyncExternalStore(watchCameraOrientation, getAngle, () => 0);
  return getCameraRotationCorrection(facing, angle, typeof navigator === "undefined" ? "" : navigator.userAgent);
}
