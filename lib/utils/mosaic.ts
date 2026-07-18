export type Placement = { row: number; col: number; label: string };

// モザイクアートの設定 (64x36 横長)
export const GRID_COLS = 64;
export const GRID_ROWS = 36;

/**
 * 64x36 のグリッド上で "COLLAGE" という横文字を作るための座標リストを生成
 */
export function generateCollageMosaicPlacements(): Placement[] {
  const placements: Placement[] = [];
  
  const addRect = (label: string, r: number, c: number, w: number, h: number) => {
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        placements.push({ row: r + i, col: c + j, label });
      }
    }
  };

  // 文字幅6, 高さ10, 文字間隔2
  // 合計幅 = 7 * 6 + 6 * 2 = 54
  // 左マージン = (64 - 54) / 2 = 5
  // 上マージン = (36 - 10) / 2 = 13
  const letters = ["C", "O", "L", "L", "A", "G", "E"];

  letters.forEach((char, index) => {
    const c = 5 + index * 8; // 左端の列
    const r = 13;            // 上端の行

    if (char === "C") {
      addRect("C-top", r, c, 6, 2);
      addRect("C-left", r + 2, c, 2, 6);
      addRect("C-bottom", r + 8, c, 6, 2);
    } else if (char === "O") {
      addRect("O-top", r, c, 6, 2);
      addRect("O-left", r + 2, c, 2, 6);
      addRect("O-right", r + 2, c + 4, 2, 6);
      addRect("O-bottom", r + 8, c, 6, 2);
    } else if (char === "L") {
      addRect("L-left", r, c, 2, 8);
      addRect("L-bottom", r + 8, c, 6, 2);
    } else if (char === "A") {
      addRect("A-top", r, c, 6, 2);
      addRect("A-left", r + 2, c, 2, 8);
      addRect("A-right", r + 2, c + 4, 2, 8);
      addRect("A-bar", r + 4, c + 2, 2, 2);
    } else if (char === "G") {
      addRect("G-top", r, c, 6, 2);
      addRect("G-left", r + 2, c, 2, 6);
      addRect("G-bottom", r + 8, c, 6, 2);
      addRect("G-right", r + 4, c + 4, 2, 4);
      addRect("G-bar", r + 4, c + 2, 2, 2);
    } else if (char === "E") {
      addRect("E-top", r, c, 6, 2);
      addRect("E-left", r + 2, c, 2, 6);
      addRect("E-mid", r + 4, c + 2, 3, 2);
      addRect("E-bottom", r + 8, c, 6, 2);
    }
  });

  return placements;
}
