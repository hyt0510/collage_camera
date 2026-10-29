import "server-only";
import { createHash } from "node:crypto";
import { getAppCheck } from "firebase-admin/app-check";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

/** 会場でIPを共有する参加者を巻き込まないよう、UIDとAPI全体で制限する。 */
export async function protectParticipantRequest(request: Request, uid: string, scope: "submissions" | "prize" | "print-code"): Promise<NextResponse | null> {
  if (process.env.APP_CHECK_ENFORCED === "true") {
    const token = request.headers.get("X-Firebase-AppCheck");
    if (!token) return NextResponse.json({ error: "アプリの確認が必要です。ページを再読み込みしてください。" }, { status: 401 });
    try { await getAppCheck().verifyToken(token); }
    catch { return NextResponse.json({ error: "アプリを確認できませんでした。ページを再読み込みしてください。" }, { status: 401 }); }
  }
  const window = Math.floor(Date.now() / 60_000);
  const userKey = createHash("sha256").update(uid).digest("hex");
  const globalRef = db.collection("api_limits").doc(scope);
  const userRef = db.collection("api_limits").doc(`${scope}_${userKey}`);
  try {
    const accepted = await db.runTransaction(async (tx) => {
      const [global, user] = await Promise.all([tx.get(globalRef), tx.get(userRef)]);
      const globalCount = global.get("window") === window ? global.get("count") as number : 0;
      const userCount = user.get("window") === window ? user.get("count") as number : 0;
      if (globalCount >= 1_200 || userCount >= 30) return false;
      tx.set(globalRef, { window, count: globalCount + 1 });
      tx.set(userRef, { window, count: userCount + 1 });
      return true;
    });
    return accepted ? null : NextResponse.json({ error: "アクセスが集中しています。1分待ってからもう一度お試しください。" }, { status: 429, headers: { "Retry-After": "60" } });
  } catch (error) {
    console.error("APIの受付制限を確認できませんでした。", error);
    return NextResponse.json({ error: "現在受付を確認できません。少し待ってからもう一度お試しください。" }, { status: 503 });
  }
}
