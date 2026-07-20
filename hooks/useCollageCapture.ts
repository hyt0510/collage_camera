import { useState, useEffect, useCallback, useRef } from "react";
import { User } from "firebase/auth";
import { FrameTemplate, FRAME_TEMPLATES, CAPTURE_THEMES } from "@/lib/collage-config";
import { fetchAssignedPreset, submitCollageData } from "@/services/api/collage";
import { generateCollageImage, compressImage } from "@/lib/utils/image";
import { loadHistoryFromDB, saveHistoryToDB } from "@/lib/utils/idb";

const IMAGES_KEY = "collage_v10_img";
const PRESET_KEY = "collage_v10_preset";
const SUBMISSION_COUNT_KEY = "collage_v10_count";
const HISTORY_KEY = "collage_v10_history";
const UNLOCKED_QRS_KEY = "collage_v10_unlocked_qrs";

export interface CollageHistoryItem {
  id: string;
  dataUrl: string;
  createdAt: string;
  placementLabel: string;
}

export function useCollageCapture(user: User | null) {
  const userId = user?.uid ?? "";
  const [presetId, setPresetId] = useState<string>("");
  const [template, setTemplate] = useState<FrameTemplate>(() => FRAME_TEMPLATES[0]!);
  const [themeMap, setThemeMap] = useState<Record<string, string>>(() => {
    return FRAME_TEMPLATES[0]!.polygons.reduce((acc, p, i) => ({ 
      ...acc, [p.id]: CAPTURE_THEMES[i % CAPTURE_THEMES.length] 
    }), {});
  });

  const [images, setImages] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [collageDataUrl, setCollageDataUrl] = useState<string | null>(null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [collageHistory, setCollageHistory] = useState<CollageHistoryItem[]>([]);
  const [unlockedQRs, setUnlockedQRs] = useState<string[]>([]);
  const isUnlockedQRsInitialized = useRef(false);

  const pushLog = useCallback((_msg: string) => {}, []);

  const reset = useCallback(() => {
    setResult(null);
    setCollageDataUrl(null);
    setImages({});
    localStorage.removeItem(IMAGES_KEY);
    pushLog("UI Reset for new submission");

    // リセット時に即座に最新プリセットと同期する
    fetchAssignedPreset().then(preset => {
      if (preset) {
        setPresetId(preset.id);
        setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
        setThemeMap(preset.themeMap);
        localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
        pushLog(`Preset synced after reset: ${preset.id}`);
      }
    }).catch(e => pushLog(`Sync error after reset: ${String(e)}`));
  }, [pushLog]);

  // localStorage同期
  useEffect(() => {
    if (Object.keys(images).length > 0) {
      try {
        localStorage.setItem(IMAGES_KEY, JSON.stringify(images));
      } catch (e) {
        pushLog("localStorage sync failed (quota?)");
      }
    }
  }, [images, pushLog]);

  // unlockedQRs の localStorage 同期
  useEffect(() => {
    if (!isUnlockedQRsInitialized.current) return;
    try {
      localStorage.setItem(UNLOCKED_QRS_KEY, JSON.stringify(unlockedQRs));
    } catch (e) {
      pushLog("localStorage sync for unlocked QRs failed");
    }
  }, [unlockedQRs, pushLog]);

  const syncPreset = useCallback(async () => {
    // 撮影進行中(すでに写真が1枚以上撮影されている場合)は、プリセットが切り替わらないように同期をスキップ
    let hasImages = Object.keys(images).length > 0;
    if (!hasImages && typeof window !== "undefined") {
      const savedImages = localStorage.getItem(IMAGES_KEY);
      if (savedImages) {
        try {
          const parsed = JSON.parse(savedImages);
          if (Object.keys(parsed).length > 0) {
            hasImages = true;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (hasImages) {
      return;
    }
    try {
      const preset = await fetchAssignedPreset();
      if (preset) {
        const themeMapChanged = JSON.stringify(preset.themeMap) !== JSON.stringify(themeMap);
        if ((presetId && preset.id !== presetId) || (presetId && themeMapChanged)) {
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`New preset or theme detected: ${preset.id}.`);
        } else if (!presetId) {
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`Initial preset synced: ${preset.id}`);
        }
      }
    } catch (e) { pushLog(`Sync error in poll: ${String(e)}`); }
  }, [presetId, themeMap, images, pushLog]);

  useEffect(() => {
    const timer = setInterval(() => {
      void syncPreset();
    }, 10000);

    const handleFocus = () => {
      void syncPreset();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncPreset();
      }
    });

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncPreset]);

  useEffect(() => {
    try {
      pushLog("--- Collage App Mounted ---");

      const savedCount = localStorage.getItem(SUBMISSION_COUNT_KEY);
      if (savedCount) setSubmissionCount(parseInt(savedCount, 10));

      const savedUnlocked = localStorage.getItem(UNLOCKED_QRS_KEY);
      if (savedUnlocked) {
        try {
          setUnlockedQRs(JSON.parse(savedUnlocked));
        } catch (e) {
          pushLog("Unlocked QRs restoration failed");
        }
      }
      isUnlockedQRsInitialized.current = true;

      loadHistoryFromDB().then(parsed => {
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCollageHistory(parsed.slice(0, 5));
        } else {
          // 移行用: IndexedDBになければlocalStorageから読み込む
          const savedHistory = localStorage.getItem(HISTORY_KEY);
          if (savedHistory) {
            try {
              const oldParsed = JSON.parse(savedHistory);
              if (Array.isArray(oldParsed)) {
                setCollageHistory(oldParsed.slice(0, 5));
                // IndexedDBへ移行保存
                void saveHistoryToDB(oldParsed.slice(0, 5));
              }
            } catch (e) {
              pushLog("History restoration failed");
            }
          }
        }
      });

      loadHistoryFromDB().then(parsed => {
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCollageHistory(parsed.slice(0, 5));
        } else {
          // 移行用: IndexedDBになければlocalStorageから読み込む
          const savedHistory = localStorage.getItem(HISTORY_KEY);
          if (savedHistory) {
            try {
              const oldParsed = JSON.parse(savedHistory);
              if (Array.isArray(oldParsed)) {
                setCollageHistory(oldParsed.slice(0, 5));
                // IndexedDBへ移行保存
                void saveHistoryToDB(oldParsed.slice(0, 5));
              }
            } catch (e) {
              pushLog("History restoration failed");
            }
          }
        }
      });

      const savedImages = localStorage.getItem(IMAGES_KEY);
      const savedPreset = localStorage.getItem(PRESET_KEY);
      
      if (savedImages && savedPreset) {
        try {
          const parsedImages = JSON.parse(savedImages);
          const preset = JSON.parse(savedPreset);
          setImages(parsedImages);
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          pushLog(`Resuming: ${Object.keys(parsedImages).length} photos`);
        } catch (e) { pushLog("Restoration failed"); }
      } else {
        // マウント時の初期同期
        fetchAssignedPreset().then(preset => {
          if (preset) {
            setPresetId(preset.id);
            setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
            setThemeMap(preset.themeMap);
            localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
            pushLog(`Initial preset synced: ${preset.id}`);
          }
        }).catch(e => pushLog(`Initial sync error: ${String(e)}`));
      }

    } catch (globalError) {
      pushLog(`CRITICAL MOUNT ERROR: ${String(globalError)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // データURLを直接セットする（アプリ内カメラ用）
  const setImageDataUrl = useCallback((polygonId: string, dataUrl: string) => {
    setImages(prev => ({ ...prev, [polygonId]: dataUrl }));
    pushLog(`Direct image set: ${polygonId}`);
  }, [pushLog]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, polygonId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const optimized = await compressImage(file, pushLog);
      setImages(prev => ({ ...prev, [polygonId]: optimized }));
      pushLog(`Success: ${polygonId} set`);
    } catch (e) {
      pushLog(`Error during capture: ${String(e)}`);
      setErrorMessage(`画像の読み込みに失敗しました: ${String(e)}`);
    } finally {
      event.target.value = "";
    }
  };

  const submit = async () => {
    if (!template || !presetId || !user) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      pushLog("Generating collage image...");
      const generatedUrl = await generateCollageImage(template, images);
      setCollageDataUrl(generatedUrl);

      // Firebase IDトークンを取得
      const idToken = await user.getIdToken();

      const res = await submitCollageData({
        userId,
        templateId: template.id,
        presetId: presetId,
        collageDataUrl: generatedUrl,
        // 個別画像は重いため、サーバーには送らずテーマ情報のみ送る（または空にする）
        items: template.polygons.map(p => ({
          polygonId: p.id, theme: themeMap[p.id] || "", dataUrl: "" // ここを空にする
        })),
      }, idToken);
      setResult(res);
      
      const newCount = submissionCount + 1;
      setSubmissionCount(newCount);
      localStorage.setItem(SUBMISSION_COUNT_KEY, newCount.toString());
      
      // 履歴に追加 (最大5件)
      const historyItem: CollageHistoryItem = {
        id: res.id,
        dataUrl: generatedUrl,
        createdAt: new Date().toISOString(),
        placementLabel: res.placementLabel,
      };
      const newHistory = [historyItem, ...collageHistory].slice(0, 5);
      setCollageHistory(newHistory);
      
      // Base64画像は大きいため、localStorageの5MB制限を回避するためにIndexedDBに保存する
      void saveHistoryToDB(newHistory).then(() => {
        // 保存できたら古いlocalStorageからは削除して容量を空ける
        localStorage.removeItem(HISTORY_KEY);
      });

      localStorage.removeItem(IMAGES_KEY);
      pushLog("Submission complete.");

    } catch (e: any) { 
      pushLog(`Submit failed: ${String(e)}`);
      setErrorMessage(`${e}`); 
    } finally { 
      setSubmitting(false); 
    }
  };

  return { 
    template, themeMap, images, errorMessage, 
    submitting, result, collageDataUrl, submissionCount, 
    collageHistory, unlockedQRs, setUnlockedQRs, presetId,
    handleFileChange, setImageDataUrl, submit, reset, pushLog 
  };
}
