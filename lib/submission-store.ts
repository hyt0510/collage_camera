import { withOperationLock, withSubmissionReset } from "@/lib/operation-lock";
import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { db, bucket } from "./firebase-admin";
import { generateCollageMosaicPlacements } from "./utils/mosaic";
import type { DecodedImage } from "./submission-validation";

export type ModerationStatus =
  | "approved"
  | "pending_manual"
  | "hidden_auto" | "hidden_manual";

export type ModerationResult = {
  safe: boolean | null;
  source: "cloud-vision" | "disabled";
  reason: string;
};

export type SubmissionItemInput = {
  polygonId: string;
  theme: string;
};

export type SubmissionItem = {
  polygonId: string;
  theme: string;
  imageUrl?: string;
  // 旧データ用。現在は投稿全体の moderation に記録する
  moderation?: ModerationResult;
};

export type Placement = {
  row: number;
  col: number;
  label: string;
};

export type Submission = {
  id: string;
  userId: string;
  templateId: string;
  presetId?: string;
  prizeEligible?: boolean;
  createdAt: string;
  status: ModerationStatus;
  placement: Placement;
  items: SubmissionItem[];
  collageImageUrl?: string;
  // コラージュ画像の検閲結果（旧データには無い）
  moderation?: ModerationResult;
};

// 1人(匿名認証のUID)あたりの投稿上限と、連続投稿の最短間隔
// 運用に合わせてここを変える
export const MAX_SUBMISSIONS_PER_USER = 10;
export const MIN_SUBMISSION_INTERVAL_MS = 30_000;

const QUOTA_COLLECTION = "submission_quotas";

function submissionVersionRef() {
  return db.collection("settings").doc("submissionVersion");
}

/** 別のサーバーで行われた表示変更も、一覧を読む前に1件の確認で検知する。 */
export async function getSubmissionVersion(): Promise<string> {
  const snapshot = await submissionVersionRef().get();
  return (snapshot.get("version") as string | undefined) ?? "";
}

// 表示状態だけ変わって更新番号が残ると、他のサーバーが古い一覧を返すため同時に保存する
async function setSubmissionStatus(ref: DocumentReference, status: ModerationStatus): Promise<void> {
  const batch = db.batch();
  batch.update(ref, { status });
  batch.set(submissionVersionRef(), { version: randomUUID() });
  await batch.commit();
}

export class SubmissionLimitError extends Error {
  constructor(public readonly reason: "limit" | "too_soon") {
    super(`SUBMISSION_LIMIT_${reason.toUpperCase()}`);
  }
}

// モザイク用の座標プールを生成
const MOSAIC_PLACEMENTS = generateCollageMosaicPlacements();

// 管理画面で非公開画像を見せるための期限付きURLの有効期間
const ADMIN_IMAGE_URL_TTL_MS = 15 * 60 * 1000;

function storagePathFromUrl(url?: string): string | null {
  if (!url) return null;
  const prefix = `https://storage.googleapis.com/${bucket.name}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

function imageUrlsOf(submission: Submission): string[] {
  return [submission.collageImageUrl, ...submission.items.map((item) => item.imageUrl)]
    .filter((url): url is string => !!url);
}

// 承認済みの画像だけを公開し、それ以外はURLを知っていても見られないようにする
async function setImagesPublic(submission: Submission, isPublic: boolean, ignoreMissing = false): Promise<void> {
  await Promise.all(imageUrlsOf(submission).map(async (url) => {
    const path = storagePathFromUrl(url);
    if (!path) return;
    const file = bucket.file(path);
    try {
      await file.setMetadata({ cacheControl: "no-store" });
      await (isPublic ? file.makePublic() : file.makePrivate());
    } catch (error) {
      if (ignoreMissing && typeof error === "object" && error !== null && "code" in error && Number(error.code) === 404) return;
      throw error;
    }
  }));
}

async function uploadImage(image: DecodedImage, path: string, isPublic: boolean): Promise<string> {
  const file = bucket.file(path);

  // 中身から判定した実際の形式で保存する
  await file.save(image.buffer, {
    metadata: { contentType: image.contentType, cacheControl: "no-store" },
    public: isPublic,
  });

  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/**
 * 投稿枠を1つ確保する。上限超過や連続投稿なら SubmissionLimitError を投げる
 * 検閲や画像保存の前に呼び、荒らしによる課金APIやStorageの消費を防ぐ
 */
export async function reserveSubmissionQuota(userId: string, presetId?: string): Promise<void> {
  const ref = db.collection(QUOTA_COLLECTION).doc(userId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const count = (snapshot.get("count") as number | undefined) ?? 0;
    const lastAt = (snapshot.get("lastAt") as number | undefined) ?? 0;
    const now = Date.now();

    if (presetId !== "pre-festival-home" && count >= MAX_SUBMISSIONS_PER_USER) throw new SubmissionLimitError("limit");
    if (now - lastAt < MIN_SUBMISSION_INTERVAL_MS) throw new SubmissionLimitError("too_soon");

    tx.set(ref, { count: count + 1, lastAt: now }, { merge: true });
  });
}

/**
 * 保存に失敗した投稿の枠を返す（連続投稿の間隔はそのまま残す）
 */
export async function releaseSubmissionQuota(userId: string): Promise<void> {
  try {
    await db.collection(QUOTA_COLLECTION).doc(userId).update({ count: FieldValue.increment(-1) });
  } catch (e) {
    console.warn("Failed to release submission quota:", e);
  }
}

export async function createSubmission(input: {
  userId: string;
  templateId: string;
  presetId: string;
  submissionId?: string;
  prizeEligible: boolean;
  status: ModerationStatus;
  moderation: ModerationResult;
  collage: DecodedImage;
  items: SubmissionItemInput[];
}): Promise<Submission> {

  const submissionRef = input.submissionId
    ? db.collection("submissions").doc(input.submissionId)
    : db.collection("submissions").doc();
  const submissionId = submissionRef.id;

  // 1. 画像アップロード
  let collageImageUrl: string;
  try {
    const collagePath = `submissions/${submissionId}_collage.${input.collage.extension}`;
    collageImageUrl = await uploadImage(input.collage, collagePath, false);
  } catch (e) {
    console.error("Step 1 FAILED (Storage):", e);
    throw new Error("画像の保存に失敗しました。");
  }

  // 2. データ準備

  // 読み取りを減らすため、既存の投稿を確認せずモザイク座標プールからランダムに配置を決定
  const placement = MOSAIC_PLACEMENTS[Math.floor(Math.random() * MOSAIC_PLACEMENTS.length)]!;

  const submission: Submission = {
    id: submissionId,
    userId: input.userId,
    templateId: input.templateId,
    presetId: input.presetId,
    prizeEligible: input.prizeEligible,
    createdAt: new Date().toISOString(),
    status: input.status === "approved" ? "pending_manual" : input.status,
    placement,
    items: input.items.map((item) => ({ polygonId: item.polygonId, theme: item.theme })),
    collageImageUrl,
    moderation: input.moderation,
  };

  // 3. Firestore保存
  try {
    await submissionRef.set(submission);
  } catch (e) {
    console.error("Step 3 FAILED (Firestore):", e);
    throw e;
  }

  if (input.status === "approved") {
    await withOperationLock(`submission-${submissionId}`, async () => {
      const current = await submissionRef.get();
      if (!current.exists) throw new Error("投稿は削除されました。");
      if (current.get("status") !== "pending_manual") {
        submission.status = current.get("status") as ModerationStatus;
        return;
      }
      // 公開前に管理画面で扱える記録を残す。途中失敗でも手動で再承認できる
      try {
        await setImagesPublic(submission, true);
        await setSubmissionStatus(submissionRef, "approved");
        submission.status = "approved";
      } catch (error) {
        await setImagesPublic(submission, false).catch((rollbackError: unknown) => console.error("公開状態の復元に失敗しました。管理画面で非表示を再実行してください。", rollbackError));
        throw error;
      }
    });
  }

  return submission;
}

export async function listApprovedSubmissions(): Promise<Submission[]> {
  try {
    const snapshot = await db.collection("submissions")
      .where("status", "==", "approved")
      .orderBy("createdAt", "desc")
      .limit(500) // モザイク用に取得件数を増やす (278枠をすべて埋めるため500に拡張)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
  } catch (e) {
    console.error("Firestore list error:", e);
    throw e;
  }
}

// 取得に失敗したら空配列にせず投げる。管理画面で「投稿0件」と「DB障害」を見分けるため
export async function listAllSubmissions(): Promise<Submission[]> {
  const snapshot = await db.collection("submissions")
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
}

/**
 * 管理画面用。非公開の画像は期限付きURLに差し替えて、運営だけが確認できるようにする
 */
export async function withAdminImageUrls(submissions: Submission[]): Promise<Submission[]> {
  const expires = Date.now() + ADMIN_IMAGE_URL_TTL_MS;
  const sign = async (url?: string) => {
    const path = storagePathFromUrl(url);
    if (!path) return url;
    try {
      const [signed] = await bucket.file(path).getSignedUrl({ version: "v4", action: "read", expires });
      return signed as string;
    } catch (e) {
      console.warn(`Signed URL failed for ${path}:`, e);
      return url;
    }
  };

  return Promise.all(submissions.map(async (submission) => {
    if (submission.status === "approved") return submission;
    return {
      ...submission,
      collageImageUrl: await sign(submission.collageImageUrl),
      items: await Promise.all(submission.items.map(async (item) => ({
        ...item,
        imageUrl: await sign(item.imageUrl),
      }))),
    };
  }));
}

export async function updateSubmissionStatus(
  id: string,
  action: "approve" | "hide",
): Promise<Submission | null> {
  return withOperationLock(`submission-${id}`, async () => {
    const ref = db.collection("submissions").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return null;
    }
    const submission = { id: doc.id, ...doc.data() } as Submission;

    if (action === "approve") {
      // 公開と記録のどちらかに失敗したら、元が非公開の画像を公開状態で残さない
      try {
        await setImagesPublic(submission, true);
        await setSubmissionStatus(ref, "approved");
      } catch (error) {
        if (submission.status !== "approved") await setImagesPublic(submission, false).catch((rollbackError: unknown) => console.error("公開状態の復元に失敗しました。非表示を再実行してください。", rollbackError));
        throw error;
      }
    }
    if (action === "hide") {
      // モニターから外すのを優先し、画像の非公開化はその後に行う
      await setSubmissionStatus(ref, "hidden_manual");
      try {
        await setImagesPublic(submission, false);
      } catch (e) {
        console.error(`Failed to make images private for ${id}:`, e);
        throw new Error("表示は停止しましたが、画像の非公開化に失敗しました。もう一度非表示を実行してください。");
      }
    }

    const updated = await ref.get();
    return (updated.data() as Submission) ?? null;
  });
}

export async function deleteSubmission(id: string): Promise<boolean> {
  return withOperationLock(`submission-${id}`, async () => {
    const ref = db.collection("submissions").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;

    const submission = doc.data() as Submission;

    // 削除に失敗してもモニターへの表示は先に止め、再操作できる記録を残す
    await db.runTransaction(async (tx) => {
      tx.update(ref, { status: "hidden_manual" });
      tx.set(submissionVersionRef(), { version: randomUUID() });
      // 新しい形式の投稿は再送でも復活させない
      if (/^[a-f0-9]{64}$/.test(id)) tx.set(db.collection("submission_requests").doc(id), { deleted: true }, { merge: true });
    });
    await setImagesPublic(submission, false, true);
    await Promise.all(imageUrlsOf(submission).map(async (url) => {
      const path = storagePathFromUrl(url);
      if (!path) return;
      await bucket.file(path).delete({ ignoreNotFound: true });
    }));

    await ref.delete();
    return true;
  });
}

/**
 * 全投稿を削除する。イベントのリセットを兼ねるため、投稿回数の記録も消す
 */
export async function deleteAllSubmissions(): Promise<number> {
  return withSubmissionReset(async () => {
  const snapshot = await db.collection("submissions").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    await deleteSubmission(doc.id);
    count++;
  }

  const quotas = await db.collection(QUOTA_COLLECTION).get();
  for (let i = 0; i < quotas.docs.length; i += 400) {
    const batch = db.batch();
    quotas.docs.slice(i, i + 400).forEach((quota) => batch.delete(quota.ref));
    await batch.commit();
  }

  return count;
  });
}
