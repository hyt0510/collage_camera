import "server-only";
import { createHash } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { isMonitorClosed } from "@/lib/monitor-schedule";
import { parseMonitorAtlas, type MonitorAtlas } from "@/lib/utils/monitor-animation";

const PREVIEW_PATH = "monitor/preview.json";
const MAX_AGE_MS = 90_000;
const MAX_JSON_BYTES = 300_000;

type Preview = { buffer: Buffer; updatedAt: number; etag: string; atlas?: MonitorAtlas };

function blobToken(): string {
  const token = process.env.MONITOR_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("モニター配信用Blobが設定されていません。");
  return token;
}

function imageEtag(buffer: Buffer, atlas?: MonitorAtlas): string {
  const hash=createHash("sha256").update(buffer);
  if (atlas) hash.update(JSON.stringify(atlas));
  return `"${hash.digest("hex")}"`;
}

export async function saveMonitorPreview(buffer: Buffer, submissionIds: string[], atlas?: MonitorAtlas): Promise<boolean> {
  const startedAt = Date.now();
  if (isMonitorClosed()) return false;
  const normalizedAtlas=atlas === undefined ? undefined : parseMonitorAtlas(atlas);
  if (atlas !== undefined && (!normalizedAtlas || normalizedAtlas.placements.length !== submissionIds.length)) return false;
  const token = blobToken();
  // 参加者のGETではFirebase関連モジュールも読み込まない。
  const { withOperationLock } = await import("@/lib/operation-lock");
  const { reserveMonitorPreviewPublication, completeMonitorPreviewPublication } = await import("@/lib/monitor-preview-budget");
  return withOperationLock("monitor-preview-publish", async () => {
    const { listApprovedSubmissions } = await import("@/lib/submission-store");
    const approved = new Map((await listApprovedSubmissions()).map((submission) => [submission.id,submission.placement]));
    if (submissionIds.some((id,index) => {
      if (!approved.has(id)) return true;
      const expected=normalizedAtlas?.placements[index];
      return expected !== undefined && (approved.get(id)?.row !== expected.row || approved.get(id)?.col !== expected.col);
    }) || isMonitorClosed() || Date.now() - startedAt >= MAX_AGE_MS) return false;
    const reservation = await reserveMonitorPreviewPublication(startedAt);
    if (isMonitorClosed() || Date.now() - startedAt >= MAX_AGE_MS) return false;
    const body = JSON.stringify({ version: normalizedAtlas ? 2 : 1, updatedAt: startedAt, imageDataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`, etag: imageEtag(buffer,normalizedAtlas ?? undefined), ...(normalizedAtlas ? {atlas:normalizedAtlas} : {}) });
    if (buffer.length > 200_000 || Buffer.byteLength(body) > MAX_JSON_BYTES) throw new Error("プレビュー画像の容量が上限を超えました。");
    await put(PREVIEW_PATH, body, {
      access: "private", token, allowOverwrite: true, addRandomSuffix: false,
      contentType: "application/json", cacheControlMaxAge: 60, abortSignal: AbortSignal.timeout(10_000),
    });
    // 成否不明の書き込みは保留したままにし、後続の非表示と競合させない。
    await completeMonitorPreviewPublication(reservation);
    return true;
  });
}

/** 参加者の取得回数がFirebaseの読み取り回数に影響しないよう、Blobだけを読む。 */
export async function getMonitorPreview(): Promise<Preview | null> {
  if (isMonitorClosed()) return null;
  const response = await get(PREVIEW_PATH, { access: "private", token: blobToken(), useCache: false, abortSignal: AbortSignal.timeout(5_000) });
  if (!response?.stream) return null;
  const reader = response.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_JSON_BYTES) { await reader.cancel(); return null; }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return null; }
  if (typeof body !== "object" || body === null) return null;
  const { version, updatedAt, imageDataUrl, etag, atlas: rawAtlas } = body as Record<string, unknown>;
  const now = Date.now();
  if (isMonitorClosed(now) || (version !== 1 && version !== 2) || typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt > now || now - updatedAt >= MAX_AGE_MS || typeof etag !== "string") return null;
  const atlas = version === 2 ? parseMonitorAtlas(rawAtlas) : undefined;
  if (version === 2 && !atlas) return null;
  const match = typeof imageDataUrl === "string" && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length < 4 || buffer.length > 200_000 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff || imageEtag(buffer,atlas ?? undefined) !== etag) return null;
  return { buffer, updatedAt, etag, ...(atlas ? {atlas} : {}) };
}

/** 呼び出し元の投稿単位ロックの内側で、公開と失効を直列化する。 */
export async function withMonitorPreviewInvalidation<T>(operation: () => Promise<T>): Promise<T> {
  const token = blobToken();
  const { withOperationLock } = await import("@/lib/operation-lock");
  const { assertMonitorPreviewIdle } = await import("@/lib/monitor-preview-budget");
  return withOperationLock("monitor-preview-publish", async () => {
    await assertMonitorPreviewIdle();
    const result = await operation();
    await del(PREVIEW_PATH, { token, abortSignal: AbortSignal.timeout(5_000) });
    return result;
  });
}

export async function deleteMonitorPreview(): Promise<void> {
  await withMonitorPreviewInvalidation(async () => undefined);
}
