"use client";

import React, { useRef } from "react";

interface Props {
  errorType: "not-supported" | "permission-denied" | "error";
  onNativeCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraPermissionError({ errorType, onNativeCapture, onClose }: Props) {
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Compress and convert to data URL
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout")), 10000);
        img.onload = () => {
          clearTimeout(timeout);
          const MAX = 800;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas failed")); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
        img.src = url;
      });
      onNativeCapture(dataUrl);
    } finally {
      URL.revokeObjectURL(url);
      e.target.value = "";
    }
  };

  const messages = {
    "not-supported": {
      icon: "🚫",
      title: "カメラを利用できません",
      desc: "このブラウザはアプリ内カメラに対応していません。OS標準のカメラまたはアルバムから写真を選んでください。",
    },
    "permission-denied": {
      icon: "🔒",
      title: "カメラの使用が許可されていません",
      desc: "ブラウザの設定からカメラの権限を許可するか、OS標準のカメラで撮影してください。",
    },
    "error": {
      icon: "⚠️",
      title: "カメラの起動に失敗しました",
      desc: "予期しないエラーが発生しました。OS標準のカメラまたはアルバムから写真を選んでください。",
    },
  };

  const msg = messages[errorType];

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="text-5xl mb-4">{msg.icon}</div>
      <h2 className="text-xl font-bold text-white mb-2">{msg.title}</h2>
      <p className="text-sm text-zinc-400 mb-8 leading-relaxed max-w-xs">{msg.desc}</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {/* OS標準カメラで撮影 */}
        <div className="relative">
          <button className="w-full py-3.5 rounded-2xl bg-white text-zinc-900 font-bold text-sm shadow-lg active:scale-95 transition-transform">
            📸 OS標準カメラで撮影する
          </button>
          <input
            ref={nativeCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelected}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* アルバムから選択 */}
        <div className="relative">
          <button className="w-full py-3.5 rounded-2xl bg-zinc-800 text-white font-bold text-sm border border-zinc-700 active:scale-95 transition-transform">
            🖼️ アルバムから選択する
          </button>
          <input
            ref={albumRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelected}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* 閉じる */}
        <button
          onClick={onClose}
          className="mt-2 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
