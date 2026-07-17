import React from "react";

export function CollageBackground({ isOverlay }: { isOverlay?: boolean }) {
  return (
    <div className={`absolute inset-0 z-0 overflow-hidden pointer-events-none ${isOverlay ? "opacity-100" : "opacity-80 mix-blend-multiply"}`}>
      {/* --- Top Left --- */}
      {/* 青いテープ */}
      <div className="absolute -top-6 -left-12 w-48 h-20 bg-[#010193] rotate-[-15deg] masking-tape shadow-sm" />
      {/* 黒のドット */}
      <div 
        className="absolute top-16 -left-10 w-32 h-32 rotate-[12deg] opacity-70" 
        style={{
          backgroundImage: 'radial-gradient(#1E1E1E 30%, transparent 30%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0'
        }} 
      />

      {/* --- Top Right --- */}
      {/* 市松模様（チェッカーボード） */}
      <div 
        className="absolute -top-12 -right-12 w-48 h-32 rotate-[-10deg] opacity-90"
        style={{
          backgroundImage: 'conic-gradient(#1E1E1E 90deg, transparent 90deg 180deg, #1E1E1E 180deg 270deg, transparent 270deg)',
          backgroundSize: '24px 24px'
        }} 
      />
      {/* 黄色いテープ */}
      <div className="absolute top-20 -right-16 w-40 h-16 bg-[#E3C91D] rotate-[25deg] masking-tape shadow-sm" />

      {/* --- Center Left --- */}
      {/* 赤いテープ */}
      <div className="absolute top-[40%] -left-8 w-24 h-10 bg-[#CA0000] rotate-[35deg] masking-tape shadow-sm" />
      {/* 青のストライプ */}
      <div 
        className="absolute top-[50%] -left-16 w-32 h-32 rotate-[-20deg] opacity-60"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, #010193 0, #010193 10px, transparent 10px, transparent 20px)'
        }} 
      />

      {/* --- Center Right --- */}
      {/* 赤いドット */}
      <div 
        className="absolute top-[35%] -right-12 w-28 h-28 rotate-[15deg] opacity-60"
        style={{
          backgroundImage: 'radial-gradient(#CA0000 30%, transparent 30%)',
          backgroundSize: '20px 20px'
        }} 
      />
      {/* 白のテープ（黒枠） */}
      <div className="absolute top-[60%] -right-8 w-24 h-12 bg-[#F5F3EE] rotate-[-15deg] masking-tape shadow-sm border border-zinc-300" />

      {/* --- Bottom Left --- */}
      {/* 市松模様（チェッカーボード） */}
      <div 
        className="absolute -bottom-10 -left-16 w-48 h-40 rotate-[20deg] opacity-80"
        style={{
          backgroundImage: 'conic-gradient(#010193 90deg, transparent 90deg 180deg, #010193 180deg 270deg, transparent 270deg)',
          backgroundSize: '20px 20px'
        }} 
      />
      {/* 黄色いテープ */}
      <div className="absolute bottom-28 -left-10 w-32 h-14 bg-[#E3C91D] rotate-[-10deg] masking-tape shadow-sm" />

      {/* --- Bottom Right --- */}
      {/* 赤いテープ */}
      <div className="absolute -bottom-8 -right-8 w-56 h-24 bg-[#CA0000] rotate-[-25deg] masking-tape shadow-sm" />
      {/* 黒のストライプ */}
      <div 
        className="absolute bottom-20 -right-12 w-32 h-32 rotate-[40deg] opacity-70"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, #1E1E1E 0, #1E1E1E 8px, transparent 8px, transparent 16px)'
        }} 
      />
    </div>
  );
}
