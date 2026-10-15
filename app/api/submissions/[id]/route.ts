import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { updateSubmissionStatus } from "@/lib/submission-store";
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

  const updated = await updateSubmissionStatus(id, action);
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
  
  const success = await deleteSubmission(id);
  if (!success) {
    return NextResponse.json({ error: "対象投稿が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
