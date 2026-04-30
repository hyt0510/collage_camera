import "server-only";

import type { ModerationResult } from "@/lib/submission-store";    

type SafeSearchLikelihood =
  | "UNKNOWN"
  | "VERY_UNLIKELY"
  | "UNLIKELY"
  | "POSSIBLE"
  | "LIKELY"
  | "VERY_LIKELY";

type SafeSearchAnnotation = {
  adult?: SafeSearchLikelihood;
  violence?: SafeSearchLikelihood;
  racy?: SafeSearchLikelihood;
};

function getBase64Payload(dataUrl: string): string {
  const prefix = "data:image/";
  if (!dataUrl.startsWith(prefix) || !dataUrl.includes(";base64,")) {
    throw new Error("Invalid image data format");      
  }
  return dataUrl.split(";base64,")[1]!;
}

function isUnsafeLikelihood(value?: SafeSearchLikelihood): boolean {
  return value === "LIKELY" || value === "VERY_LIKELY";
}

/**
 * 画像の安全性を判定
 * エラー時や未設定時は「手動確認待ち(safe: null)」として返し、処理を止めない
 */
export async function moderateImage(dataUrl: string): Promise<ModerationResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  
  if (!apiKey || apiKey === "skip") {
    return {
      safe: null,
      source: "disabled",
      reason: "Cloud Vision API is not configured or skipped.",
    };
  }

  try {
    const content = getBase64Payload(dataUrl);
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content },
              features: [{ type: "SAFE_SEARCH_DETECTION" }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Cloud Vision API returned ${response.status}. Falling back to manual moderation.`);
      console.warn(`Error Details: ${errorText}`);
      return { safe: null, source: "disabled", reason: `API Error ${response.status}` };
    }

    const payload = (await response.json()) as {
      responses?: Array<{ safeSearchAnnotation?: SafeSearchAnnotation }>;
    };
    const annotation = payload.responses?.[0]?.safeSearchAnnotation; 
    const unsafe =
      isUnsafeLikelihood(annotation?.adult) ||
      isUnsafeLikelihood(annotation?.violence) ||
      isUnsafeLikelihood(annotation?.racy);

    return {
      safe: !unsafe,
      source: "cloud-vision",
      reason: unsafe ? "Detected inappropriate content." : "Safe search passed.",
    };
  } catch (error) {
    console.error("Moderation error:", error);
    return {
      safe: null,
      source: "disabled",
      reason: "Unexpected error during moderation.",
    };
  }
}
