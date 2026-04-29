import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  const line = (raw as { line?: unknown })?.line;
  if (typeof line !== "string" || line.length === 0) {
    return NextResponse.json({ error: "line は必須です。" }, { status: 400 });
  }

  console.log(`[client-log] ${line}`);
  return NextResponse.json({ ok: true });
}
