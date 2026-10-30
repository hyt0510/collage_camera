import "server-only";

import type { ModerationResult } from "@/lib/submission-store";    
import { reserveVisionRequest } from "@/lib/vision-budget";

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

// 応答が返らないときに投稿全体を待たせないための上限
const VISION_TIMEOUT_MS = 10000;

function isUnsafeLikelihood(value?: SafeSearchLikelihood): boolean {
  return value === "LIKELY" || value === "VERY_LIKELY";
}

/**
 * 画像の安全性を判定
 * エラー時や未設定時は「判定不能(safe: null)」として返し、処理を止めない
 * 判定不能の投稿は呼び出し側で手動確認待ちにする
 */
export async function moderateImage(image: Buffer): Promise<ModerationResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  
  if (!apiKey || apiKey === "skip") {
    return {
      safe: null,
      source: "disabled",
      reason: "Cloud Vision API is not configured or skipped.",
    };
  }

  try {
    if (!await reserveVisionRequest()) {
      return { safe: null, source: "disabled", reason: "Automatic moderation budget is unavailable; manual review required." };
    }
    const response = await fetch(
      "https://vision.googleapis.com/v1/images:annotate",
      {
        method: "POST",
        // キーをURLに載せるとログに残りやすいため、ヘッダーで渡す
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString("base64") },
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
    if (!annotation) {
      return { safe: null, source: "disabled", reason: "No SafeSearch result." };
    }

    const unsafe =
      isUnsafeLikelihood(annotation.adult) ||
      isUnsafeLikelihood(annotation.violence) ||
      isUnsafeLikelihood(annotation.racy);

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
