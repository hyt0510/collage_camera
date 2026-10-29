import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/firebase-admin";
import { MAX_SUBMISSIONS_PER_USER, MIN_SUBMISSION_INTERVAL_MS, SubmissionLimitError, type Submission } from "@/lib/submission-store";

export class SubmissionRequestError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

/** 再送の記録と投稿枠を一緒に確保する。応答が失われても同じ投稿を返す。 */
export async function processSubmissionRequest(
  userId: string, requestId: string, fingerprint: string,
  save: (submissionId: string) => Promise<Submission>,
): Promise<Submission> {
  const id = createHash("sha256").update(`${userId}:${requestId}`).digest("hex");
  const ref = db.collection("submission_requests").doc(id);
  const savedRef = db.collection("submissions").doc(id);
  const quotaRef = db.collection("submission_quotas").doc(userId);
  const budgetRef = db.collection("settings").doc("submissionBudget2026");
  const token = randomUUID();

  const existing = await db.runTransaction(async (tx) => {
    const [request, saved, quota, budget] = await Promise.all([tx.get(ref), tx.get(savedRef), tx.get(quotaRef), tx.get(budgetRef)]);
    if (request.get("deleted") === true) throw new SubmissionRequestError("この投稿は運営により削除されました。新しい作品を作成してください。", 410);
    if (request.exists && request.get("fingerprint") !== fingerprint) {
      throw new SubmissionRequestError("送信内容が変わっています。撮影画面からもう一度お試しください。");
    }
    if (saved.exists) return saved.data() as Submission;
    if (request.get("result")) throw new SubmissionRequestError("この投稿は運営により削除されました。新しい作品を作成してください。", 410);
    if ((request.get("expiresAt") ?? 0) > Date.now()) throw new SubmissionRequestError("投稿を処理中です。少し待ってから、もう一度お試しください。");
    const attempts: unknown = budget.exists ? budget.get("attempts") : 0;
    if (typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 0) throw new SubmissionRequestError("受付上限を確認できません。運営にお声がけください。", 503);
    if (attempts >= 1000) throw new SubmissionRequestError("イベント全体の受付上限に達しました。参加ありがとうございました。", 429);
    const reserved = request.get("reserved") === true;
    const count = (quota.get("count") as number | undefined) ?? 0;
    if (!reserved) {
      // デモを含めて同じ上限を適用し、申告するプリセットで回数制限を迂回させない。
      if (count >= MAX_SUBMISSIONS_PER_USER) throw new SubmissionLimitError("limit");
      if (Date.now() - ((quota.get("lastAt") as number | undefined) ?? 0) < MIN_SUBMISSION_INTERVAL_MS) throw new SubmissionLimitError("too_soon");
      tx.set(quotaRef, { count: count + 1, lastAt: Date.now() });
    }
    // 検閲・保存を試みる前に予約し、失敗しても戻さない。再試行も1回と数える。
    tx.set(budgetRef, { attempts: attempts + 1 });
    // Route Handlerの最大実行時間（60秒）より長く確保する
    tx.set(ref, { fingerprint, token, reserved: true, expiresAt: Date.now() + 5 * 60_000 });
    return null;
  }, { maxAttempts: 1 });
  if (existing) return existing;

  try {
    const result = await save(id);
    await db.runTransaction(async (tx) => {
      const request = await tx.get(ref);
      if (request.get("token") === token) tx.set(ref, { fingerprint, result, reserved: true, expiresAt: 0 });
    }, { maxAttempts: 1 });
    return result;
  } catch (error) {
    // 保存成功の直後に通信が切れた場合は、投稿を失敗扱いにして枠を返さない
    const recovered = await db.runTransaction(async (tx) => {
      const [request, saved, quota] = await Promise.all([tx.get(ref), tx.get(savedRef), tx.get(quotaRef)]);
      if (request.get("deleted") === true) throw new SubmissionRequestError("この投稿は運営により削除されました。新しい作品を作成してください。", 410);
      if (saved.exists) return saved.data() as Submission;
      if (request.get("token") === token && request.get("reserved") === true) {
        tx.set(quotaRef, { count: Math.max(0, (quota.get("count") ?? 0) - 1), lastAt: quota.get("lastAt") ?? 0 });
        tx.set(ref, { fingerprint, reserved: false, expiresAt: 0 });
      }
      return null;
    }, { maxAttempts: 1 });
    if (recovered) return recovered;
    throw error;
  }
}
