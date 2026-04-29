import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    // データベースが「存在するか」を確認するための軽量な呼び出し
    const collections = await db.listCollections();
    
    return NextResponse.json({
      status: "SUCCESS",
      message: "Firestore への接続に成功しました！",
      projectId: projectId,
      collectionsFound: collections.length
    });
  } catch (error: any) {
    console.error("Diagnostic failed:", error);
    return NextResponse.json({
      status: "FAILED",
      error: error.message,
      code: error.code,
      projectId: process.env.FIREBASE_PROJECT_ID,
      hint: "Firebaseコンソールで 'Firestore Database' を開き、'データベースの作成' ボタンを完了させてください。場所(Region)の設定まで終わっている必要があります。"
    }, { status: 500 });
  }
}
