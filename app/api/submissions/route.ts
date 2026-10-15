import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { moderateImage } from "@/lib/moderation";
import { parseSubmissionBody } from "@/lib/submission-validation";
import { listPrizeRedemptions } from "@/lib/prize-store";
import {
  createSubmission,
  listAllSubmissions,
  listApprovedSubmissions,
  releaseSubmissionQuota,
  reserveSubmissionQuota,
  SubmissionLimitError,
  withAdminImageUrls,
  type ModerationResult,
  type ModerationStatus,
} from "@/lib/submission-store";

function decideStatus(result: ModerationResult): ModerationStatus {
  if (result.safe === false) return "hidden_auto";
  // 検閲APIの失敗・未設定で判定できなかった投稿は、運営が確認するまで表示しない
  if (result.safe === null) return "pending_manual";
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
      // 非表示の投稿も含むため管理者のみ
      const denied = requireAdmin(request);
      if (denied) return denied;

      // 管理用画面はリアルタイム性を優先するためキャッシュしない
      const [submissions, redemptions] = await Promise.all([
        listAllSubmissions().then(withAdminImageUrls),
        listPrizeRedemptions(),
      ]);
      const serialized = submissions.map((submission) => ({
        ...submission,
        items: submission.items.map((item) => ({
          ...item,
          dataUrl: item.imageUrl,
        })),
        collageDataUrl: submission.collageImageUrl,
        // 景品交換は人（UID）ごとなので、同じ人の投稿にはすべて同じ時刻が付く
        prizeRedeemedAt: redemptions[submission.userId] ?? null,
      }));
      return NextResponse.json({ submissions: serialized, prizeRedemptionCount: Object.keys(redemptions).length });
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
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const body = parseSubmissionBody(raw);
  if (!body) {
    return NextResponse.json(
      { error: "投稿データが正しくありません。ページを再読み込みしてやり直してください。" },
      { status: 400 },
    );
  }

  // 2. 投稿回数の制限（検閲や画像保存より先に確認して、荒らしによる消費を防ぐ）
  try {
    await reserveSubmissionQuota(userId);
  } catch (error) {
    if (error instanceof SubmissionLimitError) {
      const message = error.reason === "limit"
        ? "投稿できる回数の上限に達しました。参加ありがとうございました！"
        : "少し時間をあけてから、もう一度投稿してください。";
      return NextResponse.json({ error: message }, { status: 429 });
    }
    console.error("Quota check error:", error);
    return NextResponse.json(
      { error: "投稿に失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }

  try {
    // 3. 検閲（モニターに実際に表示されるコラージュ画像が対象。APIが失敗しても止めない）
    const moderation = await moderateImage(body.collage.buffer);
    const status = decideStatus(moderation);

    // 4. 保存
    const submission = await createSubmission({
      userId,
      templateId: body.templateId,
      presetId: body.presetId,
      status,
      moderation,
      collage: body.collage,
      items: body.items.map(({ polygonId, theme }) => ({ polygonId, theme })),
    });

    // 新着投稿があったフラグを立てる (次回GET時にスロットリング付きで反映)
    if (status === "approved") hasNewSubmissions = true;

    return NextResponse.json({
      id: submission.id,
      placementLabel: submission.placement.label,
      status: submission.status,
    });
  } catch (error) {
    console.error("Submission error:", error);
    await releaseSubmissionQuota(userId);
    return NextResponse.json(
      { error: "保存に失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { deleteAllSubmissions } = await import("@/lib/submission-store");
  try {
    const count = await deleteAllSubmissions();
    return NextResponse.json({ success: true, count });
  } catch (e: any) {
    console.error("DELETE /api/submissions error:", e);
    return NextResponse.json({ error: "一括削除に失敗しました。" }, { status: 500 });
  }
}
