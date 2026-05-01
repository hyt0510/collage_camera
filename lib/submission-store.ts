import "server-only";
import { db, bucket } from "./firebase-admin";
import { generateCollageMosaicPlacements } from "./utils/mosaic";

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
  dataUrl: string;
};

export type SubmissionItem = {
  polygonId: string;
  theme: string;
  imageUrl?: string;
  moderation: ModerationResult;
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
  createdAt: string;
  status: ModerationStatus;
  redeemed: boolean;
  placement: Placement;
  items: SubmissionItem[];
  collageImageUrl?: string;
};

// モザイク用の座標プールを生成
const MOSAIC_PLACEMENTS = generateCollageMosaicPlacements();

async function uploadBase64Image(dataUrl: string, path: string): Promise<string> {
  const base64Data = dataUrl.split(";base64,").pop();
  if (!base64Data) throw new Error("Invalid base64 data");
  
  const buffer = Buffer.from(base64Data, "base64");
  const file = bucket.file(path);

  // WebP形式として保存
  await file.save(buffer, {
    metadata: { contentType: "image/webp" },
    public: true,
  });

  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

export async function createSubmission(input: {
  userId: string;
  templateId: string;
  presetId?: string;
  status: ModerationStatus;
  collageDataUrl?: string;
  items: Array<SubmissionItemInput & { moderation: ModerationResult }>;
}): Promise<Submission> {

  // 1. 画像アップロード
  let items: SubmissionItem[];
  let collageImageUrl: string | undefined;

  try {
    items = input.items.map((item) => ({
      polygonId: item.polygonId,
      theme: item.theme,
      moderation: item.moderation,
    }));

    if (input.collageDataUrl) {
      const collagePath = `submissions/${Date.now()}_${input.userId}_collage.webp`;
      collageImageUrl = await uploadBase64Image(input.collageDataUrl, collagePath);
    }
  } catch (e: any) {
    console.error("Step 1 FAILED (Storage):", e.message);
    throw new Error(`Storage Error: ${e.message}`);
  }

  // 2. データ準備
  const submissionRef = db.collection("submissions").doc();
  const submissionId = submissionRef.id;

  // 読み取りを減らすため、既存の投稿を確認せずモザイク座標プールからランダムに配置を決定
  const placement = MOSAIC_PLACEMENTS[Math.floor(Math.random() * MOSAIC_PLACEMENTS.length)]!;

  const submission: Submission = {
    id: submissionId,
    userId: input.userId,
    templateId: input.templateId,
    presetId: input.presetId,
    createdAt: new Date().toISOString(),
    status: input.status,
    redeemed: false,
    placement,
    items,
    collageImageUrl,
  };

  // 3. Firestore保存
  try {
    await submissionRef.set(submission);
  } catch (e: any) {
    console.error("Step 3 FAILED (Firestore):", e.message);
    throw e;
  }

  return submission;
}

export async function listApprovedSubmissions(): Promise<Submission[]> {
  try {
    const snapshot = await db.collection("submissions")
      .where("status", "==", "approved")
      .orderBy("createdAt", "desc")
      .limit(200) // モザイク用に取得件数を増やす
      .get();
    return snapshot.docs.map(doc => doc.data() as Submission);
  } catch (e: any) {
    console.error("Firestore list error:", e);
    return [];
  }
}

export async function listAllSubmissions(): Promise<Submission[]> {
  try {
    const snapshot = await db.collection("submissions")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    return snapshot.docs.map((doc) => doc.data() as Submission);
  } catch (e: any) {
    console.error("Firestore list(all) error:", e);
    return [];
  }
}

export async function updateSubmissionStatus(
  id: string,
  action: "approve" | "hide" | "redeem",
): Promise<Submission | null> {
  const ref = db.collection("submissions").doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    return null;
  }

  if (action === "approve") await ref.update({ status: "approved" });
  if (action === "hide") await ref.update({ status: "hidden_manual" });
  if (action === "redeem") await ref.update({ redeemed: true });

  const updated = await ref.get();
  return (updated.data() as Submission) ?? null;
}

export async function deleteSubmission(id: string): Promise<boolean> {
  const ref = db.collection("submissions").doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;

  const submission = doc.data() as Submission;

  const deleteImage = async (url?: string) => {
    if (!url) return;
    try {
      const prefix = `https://storage.googleapis.com/${bucket.name}/`;
      if (url.startsWith(prefix)) {
        const path = url.replace(prefix, "");
        await bucket.file(path).delete().catch((e: any) => console.warn(`Storage delete failed for ${path}:`, e.message));
      }
    } catch (e: any) {
      console.warn("Image deletion skip:", e);
    }
  };

  await Promise.all([
    ...submission.items.map(item => deleteImage(item.imageUrl)),
    deleteImage(submission.collageImageUrl)
  ]);

  await ref.delete();
  return true;
}

export async function deleteAllSubmissions(): Promise<number> {
  const snapshot = await db.collection("submissions").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    await deleteSubmission(doc.id);
    count++;
  }
  return count;
}
