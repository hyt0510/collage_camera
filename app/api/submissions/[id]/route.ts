import { OperationBusyError, withOperationLock } from "@/lib/operation-lock";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { updateSubmissionStatus } from "@/lib/submission-store";
import { invalidateApprovedSubmissions } from "@/lib/submission-cache";
import { isValidId } from "@/lib/submission-validation";

type Action = "approve" | "hide";

function isAction(value: unknown): value is Action {
  return value === "approve" || value === "hide";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "対象投稿が見つかりません。" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "リクエストボディが不正です。" },
        { status: 400 },
      );
    }
    throw error;
  }

  const action = (raw as { action?: unknown })?.action;
  if (!isAction(action)) {
    return NextResponse.json(
      { error: "action は approve/hide のいずれかを指定してください。" },
      { status: 400 },
    );
  }

  let updated;
  try {
    updated = await withOperationLock("admin-submissions", () => updateSubmissionStatus(id, action));
  } catch (error) {
    if (error instanceof OperationBusyError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "表示状態の変更を完了できませんでした。もう一度操作してください。" }, { status: 500 });
  } finally {
    invalidateApprovedSubmissions();
  }
  if (!updated) {
    return NextResponse.json({ error: "対象投稿が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ submission: updated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "対象投稿が見つかりません。" }, { status: 404 });
  }
  const { deleteSubmission } = await import("@/lib/submission-store");
  
  let success;
  try {
    success = await withOperationLock("admin-submissions", () => deleteSubmission(id));
  } catch (error) {
    if (error instanceof OperationBusyError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "削除を完了できませんでした。もう一度操作してください。" }, { status: 500 });
  } finally {
    invalidateApprovedSubmissions();
  }
  if (!success) {
    return NextResponse.json({ error: "対象投稿が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const maxDuration = 60;
