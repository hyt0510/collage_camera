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
  save: (submissionId: string) => Promise<Submission>, presetId?: string,
): Promise<Submission> {
  const id = createHash("sha256").update(`${userId}:${requestId}`).digest("hex");
  const ref = db.collection("submission_requests").doc(id);
  const savedRef = db.collection("submissions").doc(id);
  const quotaRef = db.collection("submission_quotas").doc(userId);
  const token = randomUUID();

  const existing = await db.runTransaction(async (tx) => {
    const [request, saved, quota] = await Promise.all([tx.get(ref), tx.get(savedRef), tx.get(quotaRef)]);
    if (request.get("deleted") === true) throw new SubmissionRequestError("この投稿は運営により削除されました。新しい作品を作成してください。", 410);
    if (request.exists && request.get("fingerprint") !== fingerprint) {
      throw new SubmissionRequestError("送信内容が変わっています。撮影画面からもう一度お試しください。");
    }
    if (saved.exists) return saved.data() as Submission;
    if (request.get("result")) throw new SubmissionRequestError("この投稿は運営により削除されました。新しい作品を作成してください。", 410);
    if ((request.get("expiresAt") ?? 0) > Date.now()) throw new SubmissionRequestError("投稿を処理中です。少し待ってから、もう一度お試しください。");
    const reserved = request.get("reserved") === true;
    const count = (quota.get("count") as number | undefined) ?? 0;
    if (!reserved) {
      // デモ用プリセットだけ投稿回数の上限を設けない。連続投稿の間隔は維持する。
      if (presetId !== "pre-festival-home" && count >= MAX_SUBMISSIONS_PER_USER) throw new SubmissionLimitError("limit");
      if (Date.now() - ((quota.get("lastAt") as number | undefined) ?? 0) < MIN_SUBMISSION_INTERVAL_MS) throw new SubmissionLimitError("too_soon");
      tx.set(quotaRef, { count: count + 1, lastAt: Date.now() });
    }
    // Route Handlerの最大実行時間（60秒）より長く確保する
    tx.set(ref, { fingerprint, token, reserved: true, expiresAt: Date.now() + 5 * 60_000 });
    return null;
  });
  if (existing) return existing;

  try {
    const result = await save(id);
    await db.runTransaction(async (tx) => {
      const request = await tx.get(ref);
      if (request.get("token") === token) tx.set(ref, { fingerprint, result, reserved: true, expiresAt: 0 });
    });
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
    });
    if (recovered) return recovered;
    throw error;
  }
}
