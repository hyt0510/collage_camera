// 0・1・I・Oを除き、受付で読み違えにくい文字だけを使う。
export const PRINT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizePrintCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return /^[2-9A-HJ-NP-Z]{6}$/.test(code) ? code : null;
}

export function formatPrintCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
