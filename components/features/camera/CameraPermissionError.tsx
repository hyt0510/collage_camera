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
    <div className="flex flex-col items-center justify-center h-full px-8 text-center bg-zinc-900">
      <div 
        className="bg-white p-6 pb-8 shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] relative max-w-sm w-full"
        style={{ transform: "rotate(1deg)" }}
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-yellow-100/80 -rotate-2 masking-tape opacity-90 z-10" />
        
        <div className="text-4xl mb-3 mt-2">{msg.icon}</div>
        <h2 className="text-lg font-bold text-zinc-900 mb-2 leading-tight">{msg.title}</h2>
        <p className="text-sm text-zinc-600 mb-6 leading-relaxed text-left">{msg.desc}</p>

        <div className="flex flex-col gap-4 w-full">
          {/* OS標準カメラで撮影 */}
          <div className="relative">
            <button 
              className="w-full py-3 bg-zinc-800 text-white font-bold text-sm shadow-[2px_2px_0_0_rgba(0,0,0,0.2)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              style={{ transform: "rotate(-1deg)" }}
            >
              📸 OS標準カメラで撮影
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
            <button 
              className="w-full py-3 bg-white text-zinc-800 border-2 border-zinc-800 font-bold text-sm shadow-[2px_2px_0_0_rgba(0,0,0,0.2)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              style={{ transform: "rotate(1deg)" }}
            >
              🖼️ アルバムから選ぶ
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
            className="mt-2 py-2 text-sm text-zinc-500 font-bold underline decoration-2 underline-offset-4"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
