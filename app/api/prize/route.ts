import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getPrizeStatus, redeemPrize } from "@/lib/prize-store";
import { getTicketRemainingMs } from "@/lib/utils/prize";

// 交換の状態を毎回最新で返す
export const dynamic = "force-dynamic";

/**
 * AuthorizationヘッダーからFirebase IDトークンを検証し、UIDを返す
 */
async function verifyUid(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch (e) {
    console.error("Token verification failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

const UNAUTHORIZED = { error: "認証に失敗しました。ページを再読み込みしてください。" };

export async function GET(request: Request) {
  const uid = await verifyUid(request);
  if (!uid) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    const status = await getPrizeStatus(uid);
    const ticketRemainingMs = status.redeemedAt ? getTicketRemainingMs(status.redeemedAt, Date.now()) : 0;
    return NextResponse.json({ ...status, ticketRemainingMs });
  } catch (e) {
    console.error("GET /api/prize error:", e);
    return NextResponse.json({ error: "景品交換の状態を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const expectedCode = process.env.PRIZE_QR_CODE;
  // 合言葉が未設定のときは、どの QR でも交換できてしまわないよう機能ごと止める
  if (!expectedCode) {
    console.error("[Prize] PRIZE_QR_CODE is not set. Prize exchange is disabled.");
    return NextResponse.json({ error: "景品交換は現在受け付けていません。本部スタッフにお声がけください。" }, { status: 503 });
  }

  const uid = await verifyUid(request);
  if (!uid) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || code !== expectedCode) {
    return NextResponse.json({ error: "本部テントの景品交換QRコードを読み取ってください。" }, { status: 400 });
  }

  try {
    const outcome = await redeemPrize(uid);
    if (outcome.result === "not_eligible") {
      return NextResponse.json(
        { error: "このブラウザで投稿したコラージュが見つかりません。コラージュを1枚投稿してから読み取ってください。" },
        { status: 409 },
      );
    }
    return NextResponse.json({
      result: outcome.result,
      redeemedAt: outcome.redeemedAt,
      ticketRemainingMs: getTicketRemainingMs(outcome.redeemedAt, Date.now()),
    });
  } catch (e) {
    console.error("POST /api/prize error:", e);
    return NextResponse.json({ error: "景品交換に失敗しました。もう一度読み取ってください。" }, { status: 500 });
  }
}
