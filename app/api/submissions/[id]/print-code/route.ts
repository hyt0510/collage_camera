import * as admin from "firebase-admin";
import { NextResponse } from "next/server";
import { protectParticipantRequest } from "@/lib/api-protection";
import { getOrCreatePrintCode, PrintCodeError } from "@/lib/print-code-store";
import { isValidId } from "@/lib/submission-validation";
import { settleParticipantRequest } from "@/lib/participant-admission";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "認証が必要です。ページを再読み込みしてください。" }, { status: 401, headers });
  let uid: string;
  try { uid = (await admin.auth().verifyIdToken(authorization.slice(7))).uid; }
  catch { return NextResponse.json({ error: "認証を確認できませんでした。ページを再読み込みしてください。" }, { status: 401, headers }); }
  const { id } = await context.params;
  if (!isValidId(id)) return NextResponse.json({ error: "作品が見つかりません。" }, { status: 404, headers });
  const denied = await protectParticipantRequest(request, uid, "print-code");
  if (denied) return denied;
  try {
    let reads = 30;
    const code = await getOrCreatePrintCode(id, uid, value => { reads = value; });
    await settleParticipantRequest(request, { reads, writes: 2 });
    return NextResponse.json({ code }, { headers });
  } catch (error) {
    const status = error instanceof PrintCodeError ? error.status : 503;
    return NextResponse.json({ error: status === 404 ? "作品が見つかりません。" : "受付番号を取得できませんでした。もう一度お試しください。" }, { status, headers });
  }
}
