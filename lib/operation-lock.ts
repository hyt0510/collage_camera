import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/firebase-admin";

export class OperationBusyError extends Error {
  constructor() { super("別の操作を処理中です。少し待ってからもう一度操作してください。"); }
}

/** サーバーが複数台でも、管理操作を重ねない。停止した処理は5分後に回収する。 */
export async function withOperationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const ref = db.collection("operation_locks").doc(key);
  const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if ((snapshot.get("expiresAt") ?? 0) > Date.now()) throw new OperationBusyError();
    tx.set(ref, { token, expiresAt: Date.now() + 5 * 60_000 });
  });
  try {
    return await operation();
  } finally {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.get("token") === token) tx.set(ref, { token: "", expiresAt: 0 });
    }).catch((error: unknown) => console.error("操作ロックの解放に失敗しました。期限後に再試行できます。", error));
  }
}

function activeSubmissions(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > Date.now()));
}

/** 投稿の受付から保存終了まで、一括削除が始まらないようにする。 */
export async function withSubmissionActivity<T>(operation: () => Promise<T>): Promise<T> {
  const ref = db.collection("operation_locks").doc("submission-activity");
  const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if ((snapshot.get("resetUntil") ?? 0) > Date.now()) throw new OperationBusyError();
    const active = activeSubmissions(snapshot.get("active"));
    active[token] = Date.now() + 5 * 60_000;
    tx.set(ref, { active, resetUntil: 0 });
  });
  try {
    return await operation();
  } finally {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const active = activeSubmissions(snapshot.get("active"));
      delete active[token];
      tx.update(ref, { active, resetUntil: snapshot.get("resetUntil") ?? 0 });
    }).catch((error: unknown) => console.error("投稿処理の解放に失敗しました。期限後に回収します。", error));
  }
}

/** 受付済みの投稿がなければ一括削除を開始し、終了まで新規投稿を止める。 */
export async function withSubmissionReset<T>(operation: () => Promise<T>): Promise<T> {
  const ref = db.collection("operation_locks").doc("submission-activity");
  const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if ((snapshot.get("resetUntil") ?? 0) > Date.now() || Object.keys(activeSubmissions(snapshot.get("active"))).length > 0) throw new OperationBusyError();
    tx.set(ref, { active: {}, resetUntil: Date.now() + 5 * 60_000, resetToken: token });
  });
  try {
    return await operation();
  } finally {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.get("resetToken") === token) tx.set(ref, { active: {}, resetUntil: 0 });
    }).catch((error: unknown) => console.error("一括削除の解放に失敗しました。期限後に再操作できます。", error));
  }
}
