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
}) {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "投稿に失敗しました。");

  return payload as SubmissionResult;
}

export async function sendDebugLogToTerminal(line: string) {
  try {
    await fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line }),
      keepalive: true,
    });
  } catch { /* ignore */ }
}
