/**
 * QR コードの読み取り結果に関するユーティリティ
 */

/**
 * 会場の QR コード（`?unlock=a_1` 付きの URL）から解除コードを取り出す。
 * URL でない、または unlock パラメータがなければ null。
 */
export function parseUnlockCode(text: string): string | null {
  try {
    return new URL(text).searchParams.get("unlock") || null;
  } catch {
    return null;
  }
}
