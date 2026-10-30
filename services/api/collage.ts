import { fetchJson } from "@/services/api/request";
import { FrameTemplate, getPresetById } from "@/lib/collage-config";
import { randomizeThemeMap } from "@/lib/utils/riddles";

export type SubmissionResult = {
  id: string;
  placementLabel: string;
  status: "approved" | "pending_manual" | "hidden_auto" | "hidden_manual";
};

export async function fetchAssignedPreset() {
  const { response, payload } = await fetchJson<{ activePreset: { id: string; templateId: string; templateName: string; polygons: FrameTemplate["polygons"]; themeMap: Record<string, string> }; error?: string }>("/api/capture-preset", { cache: "no-store" });
  if (!response.ok) throw new Error("プリセットの取得に失敗しました。");
  
  if (!payload || payload.error) throw new Error(payload?.error || "プリセットの取得に失敗しました。");
  
  const assigned = payload.activePreset as {
    id: string;
    templateId: string;
    templateName: string;
    polygons: FrameTemplate["polygons"];
    themeMap: Record<string, string>;
  };
  const preset = getPresetById(assigned.id);
  return preset?.randomThemes ? {
    ...assigned,
    themeMap: randomizeThemeMap({ id: assigned.templateId, name: assigned.templateName, polygons: assigned.polygons }, preset),
  } : assigned;
}

export async function submitCollageData(data: {
  userId: string;
  templateId: string;
  presetId: string;
  collageDataUrl?: string;
  items: Array<{ polygonId: string; theme: string; dataUrl: string }>;
}, idToken: string, requestId: string) {
  const { response, payload } = await fetchJson<SubmissionResult & { error?: string }>("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}`, "Idempotency-Key": requestId },
    body: JSON.stringify(data),
  }, 65_000);
  if (!response.ok) {
    if (response.status === 413) throw new Error("画像が大きすぎて送れませんでした。撮り直してお試しください。");
    throw new Error(payload?.error || "投稿に失敗しました。もう一度お試しください。");
  }
  if (!payload) throw new Error("投稿に失敗しました。もう一度お試しください。");

  return payload as SubmissionResult;
}
