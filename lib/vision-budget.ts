import "server-only";
import { db } from "@/lib/firebase-admin";

/** 月内の既使用量を確認して設定する。未設定なら自動検閲せず、手動確認に回す。 */
export async function reserveVisionRequest(): Promise<boolean> {
  const raw = process.env.VISION_FREE_REQUESTS_REMAINING ?? "";
  if (!/^\d+$/.test(raw)) return false;
  const maximum = Number(raw);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1000) return false;
  const month = new Date().toISOString().slice(0, 7);
  const ref = db.collection("settings").doc(`visionBudget${month}`);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const attempts: unknown = snapshot.exists ? snapshot.get("attempts") : 0;
    if (typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 0) throw new Error("検閲の受付回数を確認できません。");
    if (attempts >= maximum) return false;
    // 失敗・タイムアウトでも返却しない。外部APIで処理された可能性を残す。
    tx.set(ref, { attempts: attempts + 1 });
    return true;
  }, { maxAttempts: 1 });
}
