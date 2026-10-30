import { OperationBusyError, withOperationLock } from "@/lib/operation-lock";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { requireAdmin } from "@/lib/admin-auth";
import { protectParticipantRequest } from "@/lib/api-protection";
import {
  getActiveCapturePreset,
  listCapturePresets,
  setActiveCapturePreset,
} from "@/lib/capture-preset-store";

export async function GET(request: Request) {
  if (new URL(request.url).search) return new Response(null, { status: 400 });
  const denied = await protectParticipantRequest(request, "public-preset", "preset");
  if (denied) return denied;
  const activePreset = await getActiveCapturePreset();
  if (!activePreset) {
    return NextResponse.json({ error: "プリセット設定が未初期化です。" }, { status: 500 });
  }

  return NextResponse.json({
    presets: listCapturePresets(),
    activePreset,
  }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, must-revalidate" } });
}

export async function PUT(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

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

  const presetId = (raw as { presetId?: unknown })?.presetId;
  if (typeof presetId !== "string" || !presetId) {
    return NextResponse.json({ error: "presetId は必須です。" }, { status: 400 });
  }

  let activePreset: Awaited<ReturnType<typeof setActiveCapturePreset>>;
  try {
    activePreset = await withOperationLock("admin-presets", () => setActiveCapturePreset(presetId));
  } catch (error) {
    if (error instanceof OperationBusyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Failed to save active preset:", error);
    return NextResponse.json({ error: "プリセットの保存に失敗しました。" }, { status: 500 });
  }
  if (!activePreset) {
    return NextResponse.json({ error: "指定されたプリセットが存在しません。" }, { status: 404 });
  }

  return NextResponse.json({ activePreset });
}
