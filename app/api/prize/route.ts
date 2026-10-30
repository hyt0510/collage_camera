import { protectParticipantRequest } from "@/lib/api-protection";
import { settleParticipantRequest } from "@/lib/participant-admission";
import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getPrizeStatus, redeemPrize } from "@/lib/prize-store";
import { getTicketRemainingMs } from "@/lib/utils/prize";

// 交換の状態を毎回最新で返す
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const denied = await protectParticipantRequest(request, uid, "prize");
  if (denied) return denied;

  try {
    let reads = 12;
    const status = await getPrizeStatus(uid, count => { reads = count; });
    await settleParticipantRequest(request, { reads, writes: 0 });
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
  const denied = await protectParticipantRequest(request, uid, "prize");
  if (denied) return denied;
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || code !== expectedCode) {
    await settleParticipantRequest(request, { reads: 0, writes: 0 });
    return NextResponse.json({ error: "本部テントの景品交換QRコードを読み取ってください。" }, { status: 400 });
  }

  try {
    let reads = 12;
    const outcome = await redeemPrize(uid, new Date(), count => { reads = count; });
    await settleParticipantRequest(request, { reads, writes: outcome.result === "redeemed" ? 1 : 0 });
    if (outcome.result === "not_eligible") {
      return NextResponse.json(
        { error: "景品の対象になるコラージュが見つかりません。文化祭当日にコラージュを1枚投稿してから読み取ってください。" },
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
