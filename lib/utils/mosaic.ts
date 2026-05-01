export type Placement = { row: number; col: number; label: string };

/**
 * 16x48 のグリッド上で "COLLAGE" という文字を作るための座標リストを生成
 */
export function generateCollageMosaicPlacements(): Placement[] {
  const placements: Placement[] = [];
  const width = 16;
  
  // 各文字の開始行 (6行ずつ使用)
  const letters = [
    { char: "C", startRow: 2 },
    { char: "O", startRow: 8 },
    { char: "L", startRow: 14 },
    { char: "L", startRow: 20 },
    { char: "A", startRow: 26 },
    { char: "G", startRow: 32 },
    { char: "E", startRow: 38 },
  ];

  const addRect = (label: string, r: number, c: number, w: number, h: number) => {
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        placements.push({ row: r + i, col: c + j, label });
      }
    }
  };

  letters.forEach(({ char, startRow }) => {
    const left = 3;
    const right = 12;
    const innerWidth = right - left + 1;

    if (char === "C") {
      addRect("C-top", startRow, left, innerWidth, 2);
      addRect("C-mid", startRow + 2, left, 3, 2);
      addRect("C-bottom", startRow + 4, left, innerWidth, 2);
    } else if (char === "O") {
      addRect("O-top", startRow, left, innerWidth, 2);
      addRect("O-left", startRow + 2, left, 2, 2);
      addRect("O-right", startRow + 2, right - 1, 2, 2);
      addRect("O-bottom", startRow + 4, left, innerWidth, 2);
    } else if (char === "L") {
      addRect("L-left", startRow, left, 3, 4);
      addRect("L-bottom", startRow + 4, left, innerWidth, 2);
    } else if (char === "A") {
      addRect("A-top", startRow, left, innerWidth, 2);
      addRect("A-left", startRow + 2, left, 2, 4);
      addRect("A-right", startRow + 2, right - 1, 2, 4);
      addRect("A-bar", startRow + 2, left + 2, innerWidth - 4, 2);
    } else if (char === "G") {
      addRect("G-top", startRow, left, innerWidth, 2);
      addRect("G-left", startRow + 2, left, 3, 4);
      addRect("G-bar", startRow + 3, left + 6, innerWidth - 6, 2);
      addRect("G-bottom", startRow + 4, left + 3, innerWidth - 3, 2);
    } else if (char === "E") {
      addRect("E-top", startRow, left, innerWidth, 2);
      addRect("E-mid", startRow + 2, left, innerWidth - 3, 2);
      addRect("E-bottom", startRow + 4, left, innerWidth, 2);
      addRect("E-left", startRow + 2, left, 2, 2);
    }
  });

  return placements;
}
