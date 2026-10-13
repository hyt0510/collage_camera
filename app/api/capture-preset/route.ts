import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { requireAdmin } from "@/lib/admin-auth";
import {
  getActiveCapturePreset,
  listCapturePresets,
  setActiveCapturePreset,
} from "@/lib/capture-preset-store";

export async function GET() {
  const activePreset = await getActiveCapturePreset();
  if (!activePreset) {
    return NextResponse.json({ error: "プリセット設定が未初期化です。" }, { status: 500 });
  }

  return NextResponse.json({
    presets: listCapturePresets(),
    activePreset,
  });
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
    activePreset = await setActiveCapturePreset(presetId);
  } catch (error) {
    console.error("Failed to save active preset:", error);
    return NextResponse.json({ error: "プリセットの保存に失敗しました。" }, { status: 500 });
  }
  if (!activePreset) {
    return NextResponse.json({ error: "指定されたプリセットが存在しません。" }, { status: 404 });
  }

  return NextResponse.json({ activePreset });
}
