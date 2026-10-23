import { protectParticipantRequest } from "@/lib/api-protection";
import { createHash } from "node:crypto";
import { processSubmissionRequest, SubmissionRequestError } from "@/lib/submission-request-store";
import { getSubmissionCapturePreset } from "@/lib/capture-preset-store";
import { isPrizeEligiblePreset } from "@/lib/collage-config";
import { OperationBusyError, withOperationLock, withSubmissionActivity } from "@/lib/operation-lock";
import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { moderateImage } from "@/lib/moderation";
import { isValidId, parseSubmissionBody } from "@/lib/submission-validation";
import { getApprovedSubmissions, invalidateApprovedSubmissions } from "@/lib/submission-cache";
import { listPrizeRedemptions } from "@/lib/prize-store";
import {
  createSubmission,
  listAllSubmissions,
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
  } catch (e) {
    console.error("Token verification failed:", e instanceof Error ? e.message : "invalid token");
    return null;
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "all") {
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
        prizeRedeemedAt: redemptions?.[submission.userId] ?? null,
      }));
      // 交換記録を読めなかったときは null にして、管理画面で「—」と出す
      return NextResponse.json({
        submissions: serialized,
        prizeRedemptionCount: redemptions ? Object.keys(redemptions).length : null,
      });
    }

    const submissions = await getApprovedSubmissions();
    // モニターに必要な項目だけ返し、前回と同じ内容なら本文の転送を省く
    const payload = { submissions: submissions.map((submission) => ({
      id: submission.id,
      placement: submission.placement,
      collageImageUrl: submission.collageImageUrl,
      items: submission.items.map((item) => ({ imageUrl: item.imageUrl })),
    })) };
    const etag = `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}"`;
    const headers = { "Cache-Control": "private, no-cache", "ETag": etag, "Vary": "Authorization" };
    if (request.headers.get("If-None-Match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return NextResponse.json(payload, { headers });
  } catch (e) {
    console.error("GET /api/submissions error:", e);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}



export async function POST(request: Request) {
  // 0. Firebase IDトークン検証
  const authResult = await verifyAuthToken(request);
  if (!authResult) {
    return NextResponse.json(
      { error: "認証が必要です。ページを再読み込みしてください。" },
      { status: 401 }
    );
  }
  const userId = authResult.uid;
  const denied = await protectParticipantRequest(request, userId, "submissions");
  if (denied) return denied;

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

  const requestId = request.headers.get("Idempotency-Key");
  if (!isValidId(requestId)) return NextResponse.json({ error: "ページを再読み込みして、もう一度投稿してください。" }, { status: 400 });
  const fingerprint = createHash("sha256").update(JSON.stringify({ templateId: body.templateId, presetId: body.presetId, items: body.items.map(({ polygonId, theme }) => ({ polygonId, theme })) })).update(body.collage.buffer).digest("hex");

  try {
    const submission = await withSubmissionActivity(() => processSubmissionRequest(userId, requestId, fingerprint, async (submissionId) => {
      const activePreset = await getSubmissionCapturePreset();
      if (!activePreset) throw new Error("プリセットの確認に失敗しました。");
      const moderation = await moderateImage(body.collage.buffer);
      const status = decideStatus(moderation);
      return createSubmission({
        submissionId, userId, templateId: body.templateId, presetId: body.presetId,
        // 事前公開中に当日用IDを申告しても、景品の資格を付けない
        prizeEligible: isPrizeEligiblePreset(body.presetId) && isPrizeEligiblePreset(activePreset.id),
        status, moderation, collage: body.collage,
        items: body.items.map(({ polygonId, theme }) => ({ polygonId, theme })),
      });
    }, body.presetId));

    // このインスタンスは即座に破棄し、別インスタンスでも5秒以内に再取得する
    if (submission.status === "approved") invalidateApprovedSubmissions();

    return NextResponse.json({
      id: submission.id,
      placementLabel: submission.placement.label,
      status: submission.status,
    });
  } catch (error) {
    console.error("Submission error:", error);
    if (error instanceof OperationBusyError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof SubmissionRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SubmissionLimitError) return NextResponse.json({ error: error.reason === "limit" ? "投稿回数の上限に達しました。参加ありがとうございました！" : "少し時間をあけてから、もう一度投稿してください。" }, { status: 429 });
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
    const count = await withOperationLock("admin-submissions", () => deleteAllSubmissions());
    invalidateApprovedSubmissions();
    return NextResponse.json({ success: true, count });
  } catch (e) {
    if (e instanceof OperationBusyError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("DELETE /api/submissions error:", e);
    return NextResponse.json({ error: "一括削除に失敗しました。" }, { status: 500 });
  }
}
