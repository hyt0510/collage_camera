import { NextResponse } from "next/server";
import { moderateImage } from "@/lib/moderation";

export async function GET() {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "GOOGLE_CLOUD_VISION_API_KEY is not set in environment variables.",
    }, { status: 400 });
  }

  // テスト用の最小限の透明な1x1ピクセル画像
  const testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  try {
    const content = testImage.split(";base64,")[1]!;
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

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        message: "Cloud Vision API returned an error.",
        status: response.status,
        errorDetails: data,
        hint: response.status === 403 ? "Vision APIが有効化されているか、請求（Billing）設定が完了しているか、APIキーに制限がかかっていないか確認してください。" : undefined
      }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: "Cloud Vision API is working correctly!",
      response: data,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
