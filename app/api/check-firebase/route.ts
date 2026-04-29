import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;

  try {
    // Firestore に接続を試みる（ダミーの読み取り）
    const snapshot = await db.collection("_health_check").limit(1).get();
    
    return NextResponse.json({
      status: "SUCCESS",
      message: "Firestore に接続できました！データベースは正しく作成されています。",
      config: {
        projectId,
        bucketName,
      },
      firestoreDetails: {
        projectIdFromDb: process.env.FIREBASE_PROJECT_ID,
      }
    });
  } catch (error: any) {
    console.error("DEBUG API ERROR:", error);
    
    let advice = "Firebase コンソールで 'Firestore Database' を開き、'データベースの作成' ボタンを完了させてください。";
    if (error.message.includes("Project")) {
      advice = ".env.local の FIREBASE_PROJECT_ID が正しいか、Firebase コンソールの設定画面と照らし合わせてください。";
    }

    return NextResponse.json({
      status: "FAILED",
      error: error.message,
      code: error.code,
      advice,
      config: {
        projectId: projectId || "MISSING",
        bucketName: bucketName || "MISSING",
      }
    }, { status: 500 });
  }
}
