import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
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

/**
 * AuthorizationヘッダーからFirebase IDトークンを検証し、UIDを返す
 */
async function verifyAuthToken(request: Request): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7);
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return { uid: decodedToken.uid };
  } catch (e: any) {
    console.error("Token verification failed:", e.message);
    return null;
  }
}

// 承認済み投稿のインメモリキャッシュと制御フラグ
let cachedApprovedSubmissions: any = null;
let lastFetchedApproved: number = 0;
let hasNewSubmissions: boolean = false; // 新着投稿があったかどうかのフラグ
const CACHE_MAX_TTL_MS = 30000; // 最長キャッシュ期間 (30秒)
const CACHE_MIN_INTERVAL_MS = 5000; // 最短データ取得間隔 (5秒)

// JSTの時間（9時〜17時）をチェックするヘルパー
function checkIsEventTime(): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    });
    const hours = parseInt(formatter.format(new Date()), 10);
    return hours >= 9 && hours < 17; // JST 9:00 〜 16:59:59 の間のみ許可
  } catch (e) {
    console.error("Failed to check JST time, defaulting to true:", e);
    return true; // 判定失敗時は安全側に倒して稼働させる
  }
}

export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "all") {
      // 管理用画面はリアルタイム性を優先するためキャッシュしない
      const submissions = await listAllSubmissions();
      const serialized = submissions.map((submission) => ({
        ...submission,
        items: submission.items.map((item) => ({
          ...item,
          dataUrl: item.imageUrl,
        })),
        collageDataUrl: submission.collageImageUrl,
      }));
      return NextResponse.json({ submissions: serialized });
    }

    const now = Date.now();
    const isEventTime = checkIsEventTime();
    
    // データ再取得が必要かどうかの判定
    // JST 9時〜17時のイベント時間外である場合は、キャッシュが既に存在すればリフェッチをスキップしてFirestoreへのアクセスを防ぐ。
    // キャッシュが空の場合は、画面が真っ白になるのを防ぐため、時間外でも初回1回のみ取得を許可する。
    const needsRefetch = 
      !cachedApprovedSubmissions || 
      (isEventTime && (
        (now - lastFetchedApproved > CACHE_MAX_TTL_MS) ||
        (hasNewSubmissions && (now - lastFetchedApproved > CACHE_MIN_INTERVAL_MS))
      ));

    if (needsRefetch) {
      const submissions = await listApprovedSubmissions();
      cachedApprovedSubmissions = submissions.map((submission) => ({
        ...submission,
        items: submission.items.map((item) => ({
          ...item,
          dataUrl: item.imageUrl,
        })),
        collageDataUrl: submission.collageImageUrl,
      }));
      lastFetchedApproved = now;
      hasNewSubmissions = false; // フラグをリセット
      console.log(`[API Cache] Fetched from Firestore (Reason: ${hasNewSubmissions ? 'New Submission' : 'TTL Expired'}). Next min refetch in ${CACHE_MIN_INTERVAL_MS / 1000}s`);
    } else {
      console.log(`[API Cache] Serving cached submissions (Event Time: ${isEventTime}). Cache age: ${(now - lastFetchedApproved) / 1000}s`);
    }

    return NextResponse.json({ submissions: cachedApprovedSubmissions });
  } catch (e: any) {
    console.error("GET /api/submissions error:", e);
    return NextResponse.json({ error: "Fetch failed", details: e.message }, { status: 500 });
  }
}



export async function POST(request: Request) {
  // JSTの時間（9時〜17時）をチェック
  if (!checkIsEventTime()) {
    return NextResponse.json(
      { error: "イベント時間外（9:00〜17:00）のため、現在は新規投稿を受け付けていません。" },
      { status: 403 }
    );
  }

  // 0. Firebase IDトークン検証
  const authResult = await verifyAuthToken(request);
  if (!authResult) {
    return NextResponse.json(
      { error: "認証が必要です。ページを再読み込みしてください。" },
      { status: 401 }
    );
  }
  const userId = authResult.uid;

  // 1. Firestore接続テスト
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

    // 新着投稿があったフラグを立てる (次回GET時にスロットリング付きで反映)
    hasNewSubmissions = true;

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
