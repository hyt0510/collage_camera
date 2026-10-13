import { FrameTemplate } from "@/lib/collage-config";

export type SubmissionResult = {
  id: string;
  placementLabel: string;
  status: "approved" | "pending_manual" | "hidden_auto" | "hidden_manual";
};

export async function fetchAssignedPreset() {
  const response = await fetch("/api/capture-preset", { cache: "no-store" });
  if (!response.ok) throw new Error("プリセットの取得に失敗しました。");
  
  const payload = await response.json();
  if ("error" in payload) throw new Error(payload.error);
  
  return payload.activePreset as {
    id: string;
    templateId: string;
    templateName: string;
    polygons: FrameTemplate["polygons"];
    themeMap: Record<string, string>;
  };
}

export async function submitCollageData(data: {
  userId: string;
  templateId: string;
  presetId: string;
  collageDataUrl?: string;
  items: Array<{ polygonId: string; theme: string; dataUrl: string }>;
}, idToken: string) {
  let response: Response;
  try {
    response = await fetch("/api/submissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error("通信に失敗しました。電波の良い場所で、もう一度お試しください。");
  }

  // サーバーの上限超過などで JSON 以外が返ってきても、分かる言葉で伝える
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 413) throw new Error("画像が大きすぎて送れませんでした。撮り直してお試しください。");
    throw new Error(payload?.error || "投稿に失敗しました。もう一度お試しください。");
  }
  if (!payload) throw new Error("投稿に失敗しました。もう一度お試しください。");

  return payload as SubmissionResult;
}
