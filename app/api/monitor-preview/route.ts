import { requireAdmin } from "@/lib/admin-auth";
import { getMonitorPreview, saveMonitorPreview } from "@/lib/monitor-preview-store";
import { isValidId } from "@/lib/submission-validation";
import { isMonitorClosed, MONITOR_CLOSES_AT } from "@/lib/monitor-schedule";
import { parseMonitorAtlas } from "@/lib/utils/monitor-animation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isMonitorClosed()) return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } });
  if (new URL(request.url).search) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const preview = await getMonitorPreview();
    if (isMonitorClosed()) return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } });
    if (!preview) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const cacheSeconds = Math.max(0, Math.min(10, Math.floor((Math.min(preview.updatedAt + 90_000, MONITOR_CLOSES_AT) - Date.now()) / 1000)));
    const headers = {
      "Content-Type": preview.atlas ? "application/json" : "image/jpeg",
      "Cache-Control": `public, max-age=0, s-maxage=${cacheSeconds}, must-revalidate`,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Monitor-Updated-At": String(preview.updatedAt),
      "ETag": preview.etag,
    };
    if (request.headers.get("If-None-Match") === preview.etag) return new Response(null, { status: 304, headers });
    if (preview.atlas) return new Response(JSON.stringify({version:2,imageDataUrl:`data:image/jpeg;base64,${preview.buffer.toString("base64")}`,atlas:preview.atlas}),{headers});
    return new Response(new Uint8Array(preview.buffer), { headers });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (isMonitorClosed()) return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } });
  const denied = requireAdmin(request);
  if (denied) return denied;
  const headers = { "Cache-Control": "no-store" };
  try {
    if (Number(request.headers.get("Content-Length")) > 300_000) return new Response(null, { status: 400, headers });
    const text = await request.text();
    if (Buffer.byteLength(text) > 300_000) return new Response(null, { status: 400, headers });
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null) return new Response(null, { status: 400, headers });
    const { imageDataUrl, submissionIds, version, atlas: rawAtlas } = body as Record<string, unknown>;
    const match = typeof imageDataUrl === "string" && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
    if (!match || !Array.isArray(submissionIds) || submissionIds.length > 278 || !submissionIds.every(isValidId)) {
      return new Response(null, { status: 400, headers });
    }
    const atlas=version === 2 ? parseMonitorAtlas(rawAtlas) : undefined;
    if ((version !== undefined && version !== 1 && version !== 2) ||
        (version === 2 && (!atlas || atlas.placements.length !== submissionIds.length || new Set(submissionIds).size !== submissionIds.length)) ||
        (version !== 2 && rawAtlas !== undefined)) return new Response(null,{status:400,headers});
    const buffer = Buffer.from(match[1]!, "base64");
    if (buffer.length < 4 || buffer.length > 200_000 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return new Response(null, { status: 400, headers });
    }
    if (isMonitorClosed()) return new Response(null, { status: 410, headers });
    const saved = atlas ? await saveMonitorPreview(buffer, submissionIds,atlas) : await saveMonitorPreview(buffer, submissionIds);
    if (isMonitorClosed()) return new Response(null, { status: 410, headers });
    return new Response(null, { status: saved ? 204 : 409, headers });
  } catch (error) {
    const [{ MonitorPreviewBudgetError }, { OperationBusyError }] = await Promise.all([
      import("@/lib/monitor-preview-budget"), import("@/lib/operation-lock"),
    ]);
    if (error instanceof MonitorPreviewBudgetError) {
      if (error.reason === "limit") return new Response(null, { status: 429, headers: { ...headers, "X-Monitor-Publishing-Stopped": "true" } });
      return new Response(null, { status: error.reason === "interval" ? 429 : 409, headers: { ...headers, "Retry-After": error.reason === "pending" ? "90" : "60" } });
    }
    if (error instanceof OperationBusyError) return new Response(null, { status: 409, headers: { ...headers, "Retry-After": "60" } });
    return new Response(null, { status: error instanceof SyntaxError ? 400 : 503, headers });
  }
}
