import * as admin from "firebase-admin";

/**
 * Firebase Admin SDK の初期化
 */

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  console.log("--- Firebase Admin Discovery ---");
  console.log("Project ID:", projectId);

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey ? privateKey.replace(/\\n/g, "\n") : undefined,
      }),
      storageBucket,
    });
    console.log("SDK Initialized.");
  } catch (error) {
    console.error("SDK Init Error:", error);
  }
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();

// --- 起動時の自動診断ロジック ---
(async () => {
  try {
    // データベースの存在を確認
    await db.listCollections();
    console.log("✅ Firestore Database Found & Connected!");
  } catch (e: any) {
    console.error("❌ Firestore Database NOT FOUND (5 NOT_FOUND)");
    console.error("--------------------------------------------------");
    console.error("【解決策】以下のURLをブラウザで開き、'データベースの作成' ボタンを完了させてください。");
    console.error(`https://console.firebase.google.com/u/0/project/${process.env.FIREBASE_PROJECT_ID}/firestore`);
    console.error("--------------------------------------------------");
  }
})();
