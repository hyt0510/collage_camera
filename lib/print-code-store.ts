import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/firebase-admin";
import { PRINT_CODE_ALPHABET, normalizePrintCode } from "@/lib/utils/print-code";
import { isValidId } from "@/lib/submission-validation";

export class PrintCodeError extends Error {
  constructor(public readonly status: number) { super("受付番号を取得できませんでした。"); }
}

/** 所有者を確認し、投稿と受付番号の対応を同じトランザクションで保存する。 */
export async function getOrCreatePrintCode(submissionId: string, userId: string, onReads?: (count: number) => void): Promise<string> {
  const submissionRef = db.collection("submissions").doc(submissionId);
  const receiptRef = db.collection("print_receipts").doc(submissionId);
  let reads = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 6 }, () => PRINT_CODE_ALPHABET[randomInt(PRINT_CODE_ALPHABET.length)]).join("");
    const codeRef = db.collection("print_codes").doc(code);
    const result = await db.runTransaction(async tx => {
      reads += 2;
      const [submission, receipt] = await Promise.all([tx.get(submissionRef), tx.get(receiptRef)]);
      if (!submission.exists || submission.get("userId") !== userId) throw new PrintCodeError(404);
      const existing = receipt.get("code");
      if (typeof existing === "string" && normalizePrintCode(existing)) return existing;
      reads++;
      if ((await tx.get(codeRef)).exists) return null;
      tx.set(codeRef, { submissionId });
      tx.set(receiptRef, { code });
      return code;
    }, { maxAttempts: 1 });
    if (result) { onReads?.(reads); return result; }
  }
  throw new PrintCodeError(503);
}

export async function resolvePrintCode(input: string): Promise<string | null> {
  const code = normalizePrintCode(input);
  if (!code) return null;
  const snapshot = await db.collection("print_codes").doc(code).get();
  const id = snapshot.get("submissionId");
  return isValidId(id) ? id : null;
}
