import { requirePrint } from "@/lib/print-auth";
import { getSubmissionImage } from "@/lib/submission-store";
import { isValidId } from "@/lib/submission-validation";
import { normalizePrintCode } from "@/lib/utils/print-code";
import { resolvePrintCode } from "@/lib/print-code-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requirePrint(request.headers.get("authorization"));
  if (denied) return denied;

  const headers = {
    "Cache-Control": "private, no-store",
    "Vary": "Authorization",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  const { id } = await context.params;
  if (!isValidId(id)) return new Response(null, { status: 404, headers });

  try {
    // 印刷担当には完成したコラージュだけを返す。
    const submissionId = normalizePrintCode(id) ? await resolvePrintCode(id) : id;
    if (!submissionId) return new Response(null, { status: 404, headers });
    const image = await getSubmissionImage(submissionId);
    if (!image) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(image.buffer), {
      headers: { ...headers, "Content-Type": image.contentType },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
