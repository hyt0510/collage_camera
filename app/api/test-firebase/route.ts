import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET() {
  try {
    // Firestore にテスト書き込みを試行
    const testRef = db.collection("_debug_test").doc("ping");
    await testRef.set({ 
      timestamp: new Date().toISOString(),
      message: "Firestore connectivity test" 
    });

    return NextResponse.json({ 
      success: true, 
      message: "Firestore への接続と書き込みに成功しました！",
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  } catch (error: any) {
    console.error("Connectivity Test Failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      code: error.code,
      projectId: process.env.FIREBASE_PROJECT_ID,
      hint: "Firestore Database がコンソールで作成されているか確認してください。"
    }, { status: 500 });
  }
}
