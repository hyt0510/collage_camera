import "server-only";
import { db } from "./firebase-admin";

/**
 * 景品交換（本部テントのガチャ）の記録。ドキュメント ID は匿名認証の UID
 * 全投稿の一括削除では消さない（誤操作で全員が再び交換できる状態になるのを防ぐため）
 */
const REDEMPTION_COLLECTION = "prize_redemptions";

export type PrizeStatus = {
  // 投稿が1件以上あるか（状態は問わない）
  eligible: boolean;
  redeemedAt: string | null;
};

export type RedeemResult =
  | { result: "redeemed" | "already"; redeemedAt: string }
  | { result: "not_eligible" };

function submissionsOf(userId: string) {
  return db.collection("submissions").where("userId", "==", userId).limit(1);
}

export async function getPrizeStatus(userId: string): Promise<PrizeStatus> {
  const [redemption, submissions] = await Promise.all([
    db.collection(REDEMPTION_COLLECTION).doc(userId).get(),
    submissionsOf(userId).get(),
  ]);
  return {
    eligible: !submissions.empty,
    redeemedAt: (redemption.get("redeemedAt") as string | undefined) ?? null,
  };
}

/**
 * 景品を1回だけ交換する。同時に2回届いても、トランザクションで記録は1件にする
 */
export async function redeemPrize(userId: string, now: Date = new Date()): Promise<RedeemResult> {
  const ref = db.collection(REDEMPTION_COLLECTION).doc(userId);
  return db.runTransaction(async (tx): Promise<RedeemResult> => {
    const redemption = await tx.get(ref);
    if (redemption.exists) {
      return { result: "already", redeemedAt: redemption.get("redeemedAt") as string };
    }

    const submissions = await tx.get(submissionsOf(userId));
    if (submissions.empty) return { result: "not_eligible" };

    const redeemedAt = now.toISOString();
    tx.create(ref, { redeemedAt });
    return { result: "redeemed", redeemedAt };
  });
}

/** 管理画面用。UID ごとの交換時刻 */
export async function listPrizeRedemptions(): Promise<Record<string, string>> {
  const snapshot = await db.collection(REDEMPTION_COLLECTION).get();
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.get("redeemedAt") as string]));
}
