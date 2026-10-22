"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getCameraRotationCorrection, getCameraTiltAngle, watchCameraOrientation } from "@/lib/utils/camera";

export type SensorPermission = "not-requested" | "requesting" | "granted" | "denied" | "unsupported" | "error";
type PhysicalOrientation = Pick<DeviceOrientationEvent, "alpha" | "beta" | "gamma" | "absolute">;
export interface CameraSensorSample {
  deviceOrientation: PhysicalOrientation | null;
  sensorAgeMs: number | null;
}

function getAngle() {
  return window.screen.orientation?.angle ?? window.orientation ?? 0;
}

export function useCameraRotation(facing: "user" | "environment") {
  const angle = useSyncExternalStore(watchCameraOrientation, getAngle, () => 0);
  const [sensorPermission, setSensorPermission] = useState<SensorPermission>("not-requested");
  const [physicalAngle, setPhysicalAngle] = useState<0 | 90 | null>(null);
  const sensorSample = useRef<{ orientation: PhysicalOrientation; time: number } | null>(null);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const needsSensor = getCameraRotationCorrection("user", 90, userAgent) === 180;

  useEffect(() => {
    if (sensorPermission !== "granted") return;
    const update = (event: DeviceOrientationEvent) => {
      if (event.beta === null && event.gamma === null) return;
      sensorSample.current = {
        orientation: { alpha: event.alpha, beta: event.beta, gamma: event.gamma, absolute: event.absolute },
        time: performance.now(),
      };
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

  const getSensorSample = useCallback((): CameraSensorSample => {
    const sample = sensorSample.current;
    return {
      deviceOrientation: sample?.orientation ?? null,
      sensorAgeMs: sample ? Math.round(performance.now() - sample.time) : null,
    };
  }, []);

  return {
    rotation: getCameraRotationCorrection(facing, physicalAngle ?? angle, userAgent),
    needsSensor, sensorPermission, requestSensor, getSensorSample,
  };
}
