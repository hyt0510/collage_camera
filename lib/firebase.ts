import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 必須変数のチェック（開発時のデバッグ用）
if (process.env.NODE_ENV === "development") {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn("Firebase client-side environment variables are missing. Check your .env.local file.");
  }
}

// クライアントサイドでの初期化
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
export const db = getFirestore(app);
