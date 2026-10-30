import { fetchJson } from "@/services/api/request";
import { normalizePrintCode } from "@/lib/utils/print-code";

export async function fetchPrintCode(id: string, idToken: string): Promise<string> {
  const { response, payload } = await fetchJson<{ code?: string; error?: string }>(`/api/submissions/${encodeURIComponent(id)}/print-code`, {
    method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${idToken}` },
  });
  const code = payload?.code ? normalizePrintCode(payload.code) : null;
  if (!response.ok || !code) throw new Error(payload?.error || "受付番号を取得できませんでした。もう一度お試しください。");
  return code;
}
