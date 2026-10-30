import "server-only";
import { getAppCheck } from "firebase-admin/app-check";
import { NextResponse } from "next/server";
import { reserveParticipantRequest, type ParticipantScope } from "@/lib/participant-admission";
import { isMonitorClosed } from "@/lib/monitor-schedule";

/** 会場でIPを共有する参加者を巻き込まないよう、UIDとAPI全体で制限する。 */
export async function protectParticipantRequest(request: Request, uid: string, scope: ParticipantScope): Promise<NextResponse | null> {
  if (isMonitorClosed()) return NextResponse.json({ error: "イベントの受付は終了しました。" }, { status: 410 });
  if (scope !== "preset" && process.env.APP_CHECK_ENFORCED === "true") {
    const token = request.headers.get("X-Firebase-AppCheck");
    if (!token) return NextResponse.json({ error: "アプリの確認が必要です。ページを再読み込みしてください。" }, { status: 401 });
    try { await getAppCheck().verifyToken(token); }
    catch { return NextResponse.json({ error: "アプリを確認できませんでした。ページを再読み込みしてください。" }, { status: 401 }); }
  }
  try {
    const result = await reserveParticipantRequest(request, uid, scope);
    if (result === "closed") return NextResponse.json({ error: "イベントの受付は終了しました。" }, { status: 410 });
    return result === "accepted" ? null : NextResponse.json({ error: "受付回数の上限に達しました。時間をおいても続く場合は運営にお声がけください。" }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  } catch {
    console.error("APIの受付制限を確認できませんでした。");
    return NextResponse.json({ error: "現在受付を確認できません。少し待ってからもう一度お試しください。" }, { status: 503 });
  }
}
