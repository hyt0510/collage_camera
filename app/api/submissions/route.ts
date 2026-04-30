import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { moderateImage } from "@/lib/moderation";
import {
  createSubmission,
  listAllSubmissions,
  listApprovedSubmissions,
  type ModerationResult,
  type ModerationStatus,
} from "@/lib/submission-store";

function decideStatus(results: ModerationResult[]): ModerationStatus {
  // 不適切な内容が1つでもあれば非表示
  if (results.some((result) => result.safe === false)) return "hidden_auto";
  
  // すべてが safe: true であるか、もしくは判定がスキップ(safe: null)されている場合は「承認済み」とする
  // これにより、APIキー未設定時でもモニターに表示されるようになる
  return "approved";
}

export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    console.log(`GET /api/submissions scope=${scope}`);
    const submissions =
      scope === "all" ? await listAllSubmissions() : await listApprovedSubmissions();
    
    console.log(`Found ${submissions.length} submissions`);

    const serialized = submissions.map((submission) => ({
      ...submission,
      items: submission.items.map((item) => ({
        ...item,
        dataUrl: item.imageUrl,
      })),
      collageDataUrl: submission.collageImageUrl,
    }));

    return NextResponse.json({ submissions: serialized });
  } catch (e: any) {
    console.error("GET /api/submissions error:", e);
    return NextResponse.json({ error: "Fetch failed", details: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // 0. 接続テストを強制実行
  try {
    await db.collection("_test").limit(1).get();
  } catch (error: any) {
    console.error("Firestore connectivity check FAILED:", error.message);
    if (error.message.includes("NOT_FOUND") || error.message.includes("database")) {
      return NextResponse.json({ 
        error: "【解決策】Firebaseコンソールで 'Firestore Database' を開き、'データベースの作成' ボタンを完了させてください。プロジェクトIDが間違っている可能性もあります。",
        projectId: process.env.FIREBASE_PROJECT_ID
      }, { status: 500 });
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // 1. ユーザー識別（1人1投稿制限のため）
  // 本来は認証トークンの検証を行うべきだが、簡易化のためbodyから受け取る。
  // userIdがなければランダム生成などで代用することも検討。
  const userId = body.userId || `anonymous_${Date.now()}`;

  // 2. 検閲 (APIキーが死んでいてもエラーにしない)
  // 個別画像のみ検閲対象とする
  const moderationResults = await Promise.all(
    body.items.map((item: any) => moderateImage(item.dataUrl))
  );

  // 3. 保存
  try {
    const status = decideStatus(moderationResults);
    const submission = await createSubmission({
      userId,
      templateId: body.templateId,
      presetId: body.presetId,
      status,
      collageDataUrl: body.collageDataUrl,
      items: body.items.map((item: any, index: number) => ({
        ...item,
        moderation: moderationResults[index],
      })),
    });

    return NextResponse.json({
      id: submission.id,
      placementLabel: submission.placement.label,
      status: submission.status,
    });
  } catch (error: any) {
    console.error("Submission error:", error);
    if (error.message === "ALREADY_SUBMITTED") {
      return NextResponse.json({ error: "既に参加済みです。お一人様1回までとなります。" }, { status: 429 });
    }
    return NextResponse.json({ error: `保存に失敗: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE() {
  const { deleteAllSubmissions } = await import("@/lib/submission-store");
  try {
    const count = await deleteAllSubmissions();
    return NextResponse.json({ success: true, count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
