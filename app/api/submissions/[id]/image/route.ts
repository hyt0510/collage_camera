import { requireAdmin } from "@/lib/admin-auth";
import { getSubmissionImage } from "@/lib/submission-store";
import { isValidId } from "@/lib/submission-validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Vary": "Authorization",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  const denied = requireAdmin(request);
  if (denied) {
    for (const [key, value] of Object.entries(headers)) denied.headers.set(key, value);
    return denied;
  }

  const { id } = await context.params;
  const item = new URL(request.url).searchParams.get("item");
  const itemIndex = item === null ? undefined : Number(item);
  if (!isValidId(id) || (item !== null && (!/^\d+$/.test(item) || !Number.isSafeInteger(itemIndex)))) {
    return new Response(null, { status: 404, headers });
  }

  try {
    const image = await getSubmissionImage(id, itemIndex);
    if (!image) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(image.buffer), {
      headers: { ...headers, "Content-Type": image.contentType },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
