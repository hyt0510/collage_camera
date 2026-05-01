import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBbnTZ-tE0dR5vlVABXXfPjywcuXjHxMGk", // GOOGLE_CLOUD_VISION_API_KEY と同じであればそれを使用可
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "collagecamera-b4bce"}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "collagecamera-b4bce",
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "collagecamera-b4bce"}.firebasestorage.app`,
  messagingSenderId: "1055740443905", // 必要に応じて調整
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1055740443905:web:8d7a167732a90186178877",
};

// クライアントサイドでの初期化
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
export const db = getFirestore(app);
