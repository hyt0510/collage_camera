import { NextResponse } from "next/server";

/**
 * 管理者向けのBasic認証
 * proxy.ts（/admin 画面）と管理用APIの両方から使う
 */

type AdminAuthResult = "ok" | "unauthorized" | "not_configured";

const REALM_HEADER = 'Basic realm="Secure Area", charset="UTF-8"';

// 文字列の長さや一致位置で処理時間が変わらないように比較する
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const length = Math.max(x.length, y.length);
  for (let i = 0; i < length; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function decodeBasicCredentials(authorization: string): { user: string; pass: string } | null {
  if (!authorization.startsWith("Basic ")) return null;
  try {
    const binary = atob(authorization.slice(6).trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    // パスワードに ":" が含まれていても壊れないよう、最初の ":" だけで分割する
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { user: decoded.slice(0, separator), pass: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function checkAdminAuth(authorization: string | null): AdminAuthResult {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;
  // 環境変数が未設定のときは認証を素通りさせず、管理機能ごと止める
  if (!expectedUser || !expectedPass) return "not_configured";
  if (!authorization) return "unauthorized";

  const credentials = decodeBasicCredentials(authorization);
  if (!credentials) return "unauthorized";

  // どちらが違うかを応答時間から推測されないよう、両方とも必ず比較する
  const userOk = safeEqual(credentials.user, expectedUser);
  const passOk = safeEqual(credentials.pass, expectedPass);
  return userOk && passOk ? "ok" : "unauthorized";
}

function failureResponse(result: Exclude<AdminAuthResult, "ok">): NextResponse {
  if (result === "not_configured") {
    console.error("[AdminAuth] ADMIN_USER or ADMIN_PASSWORD is not set. Admin access is disabled.");
    return NextResponse.json({ error: "管理者認証が設定されていません。" }, { status: 503 });
  }
  return NextResponse.json(
    { error: "認証が必要です。" },
    { status: 401, headers: { "WWW-Authenticate": REALM_HEADER } },
  );
}

/**
 * /admin 画面用。認証に通れば null、通らなければ返すべきレスポンスを返す
 */
export function requireAdminPage(authorization: string | null): NextResponse | null {
  const result = checkAdminAuth(authorization);
  return result === "ok" ? null : failureResponse(result);
}

/**
 * 管理用API用。認証に通れば null、通らなければ返すべきレスポンスを返す
 */
export function requireAdmin(request: Request): NextResponse | null {
  // Basic認証はブラウザが自動で付けるため、別サイトからの書き込みリクエストを弾く
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // 不正な Origin は別サイト扱い
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "許可されていないリクエストです。" }, { status: 403 });
      }
    }
  }

  return requireAdminPage(request.headers.get("authorization"));
}
