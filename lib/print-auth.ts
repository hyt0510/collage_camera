import { NextResponse } from "next/server";

/** 印刷ページと画像取得を、運営用とは別のBasic認証で保護する。 */
export function requirePrint(authorization: string | null): NextResponse | null {
  const password = process.env.PRINT_PASSWORD;
  const headers = {
    "Cache-Control": "private, no-store",
    "Vary": "Authorization",
  };
  if (!password) {
    return NextResponse.json({ error: "印刷用の認証が設定されていません。" }, { status: 503, headers });
  }

  if (authorization?.startsWith("Basic ")) {
    try {
      const binary = atob(authorization.slice(6).trim());
      const actual = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const expected = new TextEncoder().encode(`print:${password}`);
      // 長さや一致位置にかかわらず、認証情報全体を比較する。
      let difference = actual.length ^ expected.length;
      for (let index = 0; index < Math.max(actual.length, expected.length); index++) {
        difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
      }
      if (difference === 0) return null;
    } catch {
      // 不正なBase64は未認証として扱う。
    }
  }

  return NextResponse.json({ error: "印刷用の認証が必要です。" }, {
    status: 401,
    headers: { ...headers, "WWW-Authenticate": 'Basic realm="Collage Print", charset="UTF-8"' },
  });
}
