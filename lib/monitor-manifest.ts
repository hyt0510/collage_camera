import "server-only";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import type { ModerationStatus, Submission } from "@/lib/submission-store";

const MAX_ENTRIES = 500;
const MAX_BYTES = 700_000;
const manifestRef = () => db.collection("settings").doc("submissionVersion");

/** 表示に使わないUID・検閲結果・テーマは集約しない。 */
function compact(submission: Submission): Submission {
  return {
    id: submission.id, createdAt: submission.createdAt,
    placement: submission.placement, status: "approved", userId: "", templateId: "",
    ...(submission.collageImageUrl ? { collageImageUrl: submission.collageImageUrl } : {}),
    items: submission.items.map(item => ({ polygonId: item.polygonId, theme: "", ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}) })),
  };
}

function bounded(entries: Submission[]): Submission[] {
  const result = entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ENTRIES);
  while (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) result.pop();
  return result;
}

async function loadEntries(tx: Transaction): Promise<Submission[]> {
  const snapshot = await tx.get(manifestRef());
  if (snapshot.exists && snapshot.get("entries") !== undefined) {
    const entries: unknown = snapshot.get("entries");
    if (!Array.isArray(entries)) throw new Error("モニターの集約情報が不正です。");
    return entries as Submission[];
  }
  // 既存データの移行時だけ一覧を取得する。通常の配信は1ドキュメントで完結する。
  const originals = await tx.get(db.collection("submissions").where("status", "==", "approved").orderBy("createdAt", "desc").limit(MAX_ENTRIES));
  return bounded(originals.docs.map(doc => compact(doc.data() as Submission)));
}

export async function readMonitorManifest(): Promise<Submission[]> {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(manifestRef());
    if (snapshot.exists && snapshot.get("entries") !== undefined) {
      const entries: unknown = snapshot.get("entries");
      if (!Array.isArray(entries)) throw new Error("モニターの集約情報が不正です。");
      return entries as Submission[];
    }
    const entries = await loadEntries(tx);
    tx.set(manifestRef(), { version: snapshot.get("version") ?? randomUUID(), entries });
    return entries;
  });
}

/** 表示状態と同時に確定するため、呼び出し側のトランザクションを使う。 */
export async function writeMonitorManifest(tx: Transaction, submission: Submission, status: ModerationStatus): Promise<void> {
  const previous = await loadEntries(tx);
  let entries = previous.filter(entry => entry.id !== submission.id);
  if (status !== "approved" && previous.some(entry => entry.id === submission.id)) {
    // 運営が非表示・削除したときだけ、集約の上限外にいた古い承認作品を補充する。
    const originals = await tx.get(db.collection("submissions").where("status", "==", "approved").orderBy("createdAt", "desc").limit(MAX_ENTRIES + 1));
    entries = originals.docs.map(doc => compact(doc.data() as Submission)).filter(entry => entry.id !== submission.id);
  }
  if (status === "approved") entries.push(compact(submission));
  tx.set(manifestRef(), { version: randomUUID(), entries: bounded(entries) });
}
