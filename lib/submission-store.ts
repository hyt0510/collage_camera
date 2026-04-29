import "server-only";
import { db, bucket } from "./firebase-admin";

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
  imageUrl: string;
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

const placements: Placement[] = [
  { row: 0, col: 0, label: "左上エリア" },
  { row: 0, col: 1, label: "上部中央エリア" },
  { row: 0, col: 2, label: "右上エリア" },
  { row: 1, col: 0, label: "左側エリア" },
  { row: 1, col: 1, label: "中央エリア" },
  { row: 1, col: 2, label: "右側エリア" },
  { row: 2, col: 0, label: "左下エリア" },
  { row: 2, col: 1, label: "下部中央エリア" },
  { row: 2, col: 2, label: "右下エリア" },
];

async function uploadBase64Image(dataUrl: string, path: string): Promise<string> {
  const base64Data = dataUrl.split(";base64,").pop();
  if (!base64Data) throw new Error("Invalid base64 data");
  
  const buffer = Buffer.from(base64Data, "base64");
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: { contentType: "image/jpeg" },
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
  
  console.log("Starting createSubmission process...");

  // 1ユーザー1投稿制限のチェック (userId + presetId)
  if (input.presetId) {
    const existing = await db.collection("submissions")
      .where("userId", "==", input.userId)
      .where("presetId", "==", input.presetId)
      .limit(1)
      .get();
    
    if (!existing.empty) {
      console.warn(`User ${input.userId} already has a submission for preset ${input.presetId}.`);
      throw new Error("ALREADY_SUBMITTED");
    }
  }
  
  // 1. 画像アップロード
  let items: SubmissionItem[];
  let collageImageUrl: string | undefined;

  try {
    // 個別画像のアップロード
    items = await Promise.all(
      input.items.map(async (item) => {
        const storagePath = `submissions/${Date.now()}_${input.userId}_${item.polygonId}.jpg`;
        console.log(`Uploading to Storage: ${storagePath}`);
        const imageUrl = await uploadBase64Image(item.dataUrl, storagePath);
        return {
          polygonId: item.polygonId,
          theme: item.theme,
          imageUrl,
          moderation: item.moderation,
        };
      })
    );

    // コラージュ全体の画像があればアップロード
    if (input.collageDataUrl) {
      const collagePath = `submissions/${Date.now()}_${input.userId}_collage.jpg`;
      console.log(`Uploading Collage to Storage: ${collagePath}`);
      collageImageUrl = await uploadBase64Image(input.collageDataUrl, collagePath);
    }

    console.log("Step 1: All images uploaded to Storage.");
  } catch (e: any) {
    console.error("Step 1 FAILED (Storage):", e.message);
    throw new Error(`Storage Error: ${e.message}`);
  }

  // 2. データ準備
  const submissionRef = db.collection("submissions").doc();
  const submissionId = submissionRef.id;

  // スマート配置ロジック: 空いている枠を優先的に探す
  let placement = placements[Math.floor(Math.random() * placements.length)]!;
  try {
    const activeSubmissions = await db.collection("submissions")
      .where("status", "in", ["approved", "pending_manual"])
      .limit(20)
      .get();
    
    const occupiedLabels = new Set(activeSubmissions.docs.map(doc => doc.data().placement.label));
    const availablePlacements = placements.filter(p => !occupiedLabels.has(p.label));

    if (availablePlacements.length > 0) {
      placement = availablePlacements[Math.floor(Math.random() * availablePlacements.length)]!;
      console.log(`Smart Placement: Picked empty slot "${placement.label}"`);
    }
  } catch (e) {
    console.warn("Smart Placement failed, falling back to random:", e);
  }

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
    console.log(`Attempting Firestore save to project: ${process.env.FIREBASE_PROJECT_ID}...`);
    await submissionRef.set(submission);
    console.log("Step 3: Firestore save successful!");
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
      .limit(100)
      .get();
    return snapshot.docs.map(doc => doc.data() as Submission);
  } catch (e: any) {
    if (e.message.includes("index") || e.code === 9) {
      const snapshot = await db.collection("submissions")
        .where("status", "==", "approved")
        .limit(100)
        .get();
      const docs = snapshot.docs.map(doc => doc.data() as Submission);
      return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    console.error("Firestore list error:", e);
    return [];
  }
}

export async function listAllSubmissions(): Promise<Submission[]> {
  try {
    const snapshot = await db.collection("submissions")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
    return snapshot.docs.map((doc) => doc.data() as Submission);
  } catch (e: any) {
    if (e.message?.includes("index") || e.code === 9) {
      const snapshot = await db.collection("submissions")
        .limit(200)
        .get();
      const docs = snapshot.docs.map((doc) => doc.data() as Submission);
      return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
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
