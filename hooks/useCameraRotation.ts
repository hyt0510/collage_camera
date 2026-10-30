"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getCameraRotationCorrection, getCameraTiltAngle, watchCameraOrientation } from "@/lib/utils/camera";

type SensorPermission = "not-requested" | "requesting" | "granted" | "denied" | "unsupported" | "error";

function getAngle() {
  return window.screen.orientation?.angle ?? window.orientation ?? 0;
}

export function useCameraRotation(facing: "user" | "environment") {
  const angle = useSyncExternalStore(watchCameraOrientation, getAngle, () => 0);
  const [sensorPermission, setSensorPermission] = useState<SensorPermission>("not-requested");
  const [physicalAngle, setPhysicalAngle] = useState<0 | 90 | null>(null);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const needsSensor = getCameraRotationCorrection("user", 90, userAgent) === 180;

  useEffect(() => {
    if (sensorPermission !== "granted") return;
    const update = (event: DeviceOrientationEvent) => {
      if (event.beta === null && event.gamma === null) return;
      setPhysicalAngle(previous => getCameraTiltAngle(event.beta, event.gamma, previous));
    };
    window.addEventListener("deviceorientation", update);
    return () => window.removeEventListener("deviceorientation", update);
  }, [sensorPermission]);

  const requestSensor = useCallback(async () => {
    if (sensorPermission === "granted" || sensorPermission === "requesting") return;
    if (typeof DeviceOrientationEvent === "undefined") {
      setSensorPermission("unsupported");
      return;
    }
    const api = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    setSensorPermission("requesting");
    try {
      // iOS の許可要求はカメラ切替などのボタン操作から直接呼ぶ。
      const permission = api.requestPermission ? await api.requestPermission() : "granted";
      setSensorPermission(permission);
    } catch {
      setSensorPermission("error");
    }
  }, [sensorPermission]);

  return {
    rotation: getCameraRotationCorrection(facing, physicalAngle ?? angle, userAgent),
    needsSensor, requestSensor,
  };
}
