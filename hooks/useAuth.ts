"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Firebase匿名認証を管理するカスタムフック
 * - アプリ起動時に自動で匿名認証を実行
 * - 既にサインイン済みなら onAuthStateChanged で復帰
 * - user.uid でFirebaseが発行した一意のUIDを取得可能
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // onAuthStateChanged で認証状態を監視
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // 既にサインイン済み（匿名 or 再訪問）
        setUser(currentUser);
        setLoading(false);
      } else {
        // 未認証 → 匿名サインインを実行
        try {
          const credential = await signInAnonymously(auth);
          setUser(credential.user);
        } catch (e: any) {
          console.error("Anonymous sign-in failed:", e);
          setError(`認証に失敗しました: ${e.message}`);
        } finally {
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, loading, error };
}
