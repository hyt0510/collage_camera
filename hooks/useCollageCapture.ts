import { useState, useEffect, useCallback, useRef } from "react";
import { User } from "firebase/auth";
import { FrameTemplate, FRAME_TEMPLATES, CAPTURE_THEMES, getPresetById } from "@/lib/collage-config";
import { fetchAssignedPreset, submitCollageData, type SubmissionResult } from "@/services/api/collage";
import { generateCollageImage, compressImage } from "@/lib/utils/image";
import { loadHistoryFromDB, saveHistoryToDB } from "@/lib/utils/idb";
import { isValidRandomThemeMap } from "@/lib/utils/riddles";
import { CAPTURE_STORAGE_KEYS, resetCaptureForFestival } from "@/lib/utils/festival-launch";

export const IMAGES_KEY = CAPTURE_STORAGE_KEYS.images;
export const PRESET_KEY = CAPTURE_STORAGE_KEYS.preset;
const SUBMISSION_REQUEST_KEY = CAPTURE_STORAGE_KEYS.request;
const SUBMISSION_COUNT_KEY = "collage_v10_count";
const HISTORY_KEY = "collage_v10_history";
const UNLOCKED_QRS_KEY = CAPTURE_STORAGE_KEYS.unlockedQrs;

type PresetSnapshot = {
  id: string;
  templateId: string;
  templateName: string;
  polygons: FrameTemplate["polygons"];
  themeMap: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// 古いバージョンや途中で壊れた保存データで画面が真っ白にならないよう、復元前に形を確かめる
function isPresetSnapshot(value: unknown): value is PresetSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.templateId === "string"
    && typeof value.templateName === "string"
    && Array.isArray(value.polygons)
    && value.polygons.length > 0
    && value.polygons.every((p) => isRecord(p) && typeof p.id === "string" && typeof p.clipPath === "string")
    && isRecord(value.themeMap)
    && Object.values(value.themeMap).every((theme) => typeof theme === "string");
}

function isImageMap(value: unknown): value is Record<string, string> {
  return isRecord(value)
    && Object.values(value).every((v) => typeof v === "string" && v.startsWith("data:image/"));
}

function isHistory(value: unknown): value is CollageHistoryItem[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) && typeof item.id === "string" && typeof item.dataUrl === "string"
    && typeof item.createdAt === "string");
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [collageDataUrl, setCollageDataUrl] = useState<string | null>(null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [collageHistory, setCollageHistory] = useState<CollageHistoryItem[]>([]);
  // 投稿してから履歴タブを開くまでの間だけ true（再読み込みで消えてよい）
  const [hasUnreadHistory, setHasUnreadHistory] = useState(false);
  const [unlockedQRs, setUnlockedQRs] = useState<string[]>([]);
  const isUnlockedQRsInitialized = useRef(false);
  // 連打で二重投稿しないよう、state の反映を待たずに止める
  const submittingRef = useRef(false);
  const captureRevision = useRef(0);
  const requestIdRef = useRef<string | null>(null);
  const clearRequest = useCallback(() => {
    requestIdRef.current = null;
    try { localStorage.removeItem(SUBMISSION_REQUEST_KEY); } catch { /* 保存できない端末でも操作を続ける */ }
  }, []);

  const pushLog = useCallback((_msg: string) => {}, []);

  const reset = useCallback(async () => {
    if (submittingRef.current) return;
    captureRevision.current += 1;
    submittingRef.current = true;
    setPreparing(true);
    setErrorMessage("");
    try {
      // 次のお題を確定するまでは完了画面で待ち、旧お題で撮影を始めないようにする。
      const preset = await fetchAssignedPreset();
      clearRequest();
      setResult(null);
      setCollageDataUrl(null);
      setImages({});
      setUnlockedQRs(previous => previous.filter(id => !id.startsWith("riddle:")));
      setPresetId(preset.id);
      setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
      setThemeMap(preset.themeMap);
      try {
        localStorage.removeItem(IMAGES_KEY);
        localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
      } catch {
        pushLog("Preset save after reset failed");
      }
    } catch {
      setErrorMessage("次のお題を取得できませんでした。もう一度作成を押してください。");
    } finally {
      submittingRef.current = false;
      setPreparing(false);
    }
  }, [pushLog, clearRequest]);

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

  const syncPreset = useCallback(async (restoredPreset?: PresetSnapshot) => {
    if (submittingRef.current) return;
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
      const revision = captureRevision.current;
      const preset = await fetchAssignedPreset();
      // 通信待ちの間に撮影や次作品の準備が始まったら、遅れて届いたお題は適用しない。
      if (revision !== captureRevision.current || submittingRef.current) return;
      if (preset) {
        const currentPresetId = restoredPreset?.id ?? presetId;
        const currentThemeMap = restoredPreset?.themeMap ?? themeMap;
        const settings = getPresetById(preset.id);
        // 同じプリセットの抽選結果は、撮影前でもフォーカスや再読込で変更しない。
        const themeMapChanged = settings?.randomThemes
          ? !isValidRandomThemeMap({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons }, settings, currentThemeMap)
          : JSON.stringify(preset.themeMap) !== JSON.stringify(currentThemeMap);
        if ((currentPresetId && preset.id !== currentPresetId) || (currentPresetId && themeMapChanged)) {
          captureRevision.current += 1;
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`New preset or theme detected: ${preset.id}.`);
        } else if (!currentPresetId) {
          captureRevision.current += 1;
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`Initial preset synced: ${preset.id}`);
        }
      }
    } catch (e) { pushLog(`Preset sync error: ${String(e)}`); }
  }, [presetId, themeMap, images, pushLog]);

  useEffect(() => {
    const handleFocus = () => {
      if (!submittingRef.current && resetCaptureForFestival(localStorage)) {
        window.location.reload();
        return;
      }
      void syncPreset();
    };
    // 登録した関数を外せるよう名前を付ける（無名関数だと撮影のたびにリスナーが増え続ける）
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncPreset]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
    if (cancelled) return;
    try {
      resetCaptureForFestival(localStorage);
      pushLog("--- Collage App Mounted ---");

      const savedCount = parseInt(localStorage.getItem(SUBMISSION_COUNT_KEY) ?? "", 10);
      if (Number.isFinite(savedCount) && savedCount > 0) setSubmissionCount(savedCount);

      const savedUnlocked = parseJson(localStorage.getItem(UNLOCKED_QRS_KEY));
      if (Array.isArray(savedUnlocked) && savedUnlocked.every((id) => typeof id === "string")) {
        setUnlockedQRs(savedUnlocked);
      } else if (savedUnlocked !== null) {
        pushLog("Unlocked QRs restoration failed");
      }
      isUnlockedQRsInitialized.current = true;

      loadHistoryFromDB().then(parsed => {
        if (isHistory(parsed) && parsed.length > 0) {
          setCollageHistory(parsed.slice(0, 5));
        } else {
          // 移行用: IndexedDBになければlocalStorageから読み込む
          const oldParsed = parseJson(localStorage.getItem(HISTORY_KEY));
          if (isHistory(oldParsed)) {
            setCollageHistory(oldParsed.slice(0, 5));
            // IndexedDBへ移行保存
            void saveHistoryToDB(oldParsed.slice(0, 5));
          } else if (oldParsed !== null) {
            pushLog("History restoration failed");
          }
        }
      }).catch(e => pushLog(`History load error: ${String(e)}`));

      const parsedImages = parseJson(localStorage.getItem(IMAGES_KEY));
      const preset = parseJson(localStorage.getItem(PRESET_KEY));

      if ((parsedImages === null || isImageMap(parsedImages)) && isPresetSnapshot(preset)) {
        // 今の枠に存在しない枠の写真は捨てる
        const slotIds = new Set(preset.polygons.map((p) => p.id));
        const restoredImages = Object.fromEntries(
          Object.entries(parsedImages ?? {}).filter(([id]) => slotIds.has(id)),
        );
        setImages(restoredImages);
        setPresetId(preset.id);
        setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
        setThemeMap(preset.themeMap);
        pushLog(`Resuming: ${Object.keys(restoredImages).length} photos`);
        // 写真がない保存状態で起動した場合も、最新のお題を確認する
        if (Object.keys(restoredImages).length === 0) void syncPreset(preset);
      } else {
        if (parsedImages !== null || preset !== null) {
          // 壊れた保存データは捨てて、最新のプリセットから始め直す
          localStorage.removeItem(IMAGES_KEY);
          localStorage.removeItem(PRESET_KEY);
          pushLog("Restoration failed: saved data was invalid");
        }
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
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // データURLを直接セットする（アプリ内カメラ用）
  const setImageDataUrl = useCallback((polygonId: string, dataUrl: string) => {
    if (submittingRef.current) return;
    captureRevision.current += 1;
    clearRequest();
    setImages(prev => ({ ...prev, [polygonId]: dataUrl }));
    pushLog(`Direct image set: ${polygonId}`);
  }, [pushLog, clearRequest]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, polygonId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const optimized = await compressImage(file, pushLog);
      if (submittingRef.current) return;
      captureRevision.current += 1;
      clearRequest();
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
    if (!template || !presetId || !user || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErrorMessage("");
    try {
      pushLog("Generating collage image...");
      const generatedUrl = await generateCollageImage(template, images);
      setCollageDataUrl(generatedUrl);

      // Firebase IDトークンを取得
      const idToken = await user.getIdToken();

      if (!requestIdRef.current) {
        try { requestIdRef.current = localStorage.getItem(SUBMISSION_REQUEST_KEY); } catch { /* メモリのIDを使う */ }
        requestIdRef.current ||= crypto.randomUUID();
        try { localStorage.setItem(SUBMISSION_REQUEST_KEY, requestIdRef.current); } catch { /* 再読込までメモリで保持する */ }
      }
      const res = await submitCollageData({
        userId,
        templateId: template.id,
        presetId: presetId,
        collageDataUrl: generatedUrl,
        // 個別画像は重いため、サーバーには送らずテーマ情報のみ送る（または空にする）
        items: template.polygons.map(p => ({
          polygonId: p.id, theme: themeMap[p.id] || "", dataUrl: "" // ここを空にする
        })),
      }, idToken, requestIdRef.current);
      setResult(res);
      
      const newCount = submissionCount + 1;
      setSubmissionCount(newCount);
      try { localStorage.setItem(SUBMISSION_COUNT_KEY, newCount.toString()); } catch { /* 投稿成功後の端末保存エラーは投稿失敗と扱わない */ }
      
      // 履歴に追加 (最大5件)
      const historyItem: CollageHistoryItem = {
        id: res.id,
        dataUrl: generatedUrl,
        createdAt: new Date().toISOString(),
        placementLabel: res.placementLabel,
      };
      const newHistory = [historyItem, ...collageHistory].slice(0, 5);
      setCollageHistory(newHistory);
      setHasUnreadHistory(true);
      
      // Base64画像は大きいため、localStorageの5MB制限を回避するためにIndexedDBに保存する
      void saveHistoryToDB(newHistory).then(() => {
        // 保存できたら古いlocalStorageからは削除して容量を空ける
        localStorage.removeItem(HISTORY_KEY);
      }).catch(() => pushLog("History save failed"));

      try { localStorage.removeItem(IMAGES_KEY); } catch { /* 次の作成で上書きする */ }
      pushLog("Submission complete.");

    } catch (e) {
      pushLog(`Submit failed: ${String(e)}`);
      setErrorMessage(e instanceof Error ? e.message : "投稿に失敗しました。もう一度お試しください。");
    } finally { 
      submittingRef.current = false;
      setSubmitting(false); 
    }
  };

  const markHistoryRead = useCallback(() => setHasUnreadHistory(false), []);

  return { 
    template, themeMap, images, errorMessage, 
    submitting, preparing, result, collageDataUrl, submissionCount,
    collageHistory, hasUnreadHistory, markHistoryRead, unlockedQRs, setUnlockedQRs, presetId,
    handleFileChange, setImageDataUrl, submit, reset, pushLog 
  };
}
