import * as admin from "firebase-admin";

/**
 * Firebase Admin SDK 初期化
 */

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
        storageBucket,
      });
    } catch (error) {
      console.error("SDK Init Error:", error);
    }
  } else {
    console.warn("Firebase Admin SDK environment variables are missing. Skipping initialization during build.");
  }
}

// 実行時エラーを防ぐため、appがある場合のみサービスを取得
export const db = admin.apps.length 
  ? admin.firestore() 
  : (null as unknown as admin.firestore.Firestore);

export const bucket = admin.apps.length 
  ? admin.storage().bucket() 
  : (null as unknown as any);
