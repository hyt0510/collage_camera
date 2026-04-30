import { useState, useEffect, useCallback } from "react";
import { FrameTemplate, FRAME_TEMPLATES, CAPTURE_THEMES } from "@/lib/collage-config";
import { fetchAssignedPreset, submitCollageData, sendDebugLogToTerminal } from "@/services/api/collage";
import { generateCollageImage, compressImage } from "@/lib/utils/image";

const IMAGES_KEY = "collage_v10_img";
const PRESET_KEY = "collage_v10_preset";
const USER_ID_KEY = "collage_v10_uid";
const SUBMISSION_COUNT_KEY = "collage_v10_count";
const HISTORY_KEY = "collage_v10_history";

export interface CollageHistoryItem {
  id: string;
  dataUrl: string;
  createdAt: string;
  placementLabel: string;
}

export function useCollageCapture() {
  const [userId, setUserId] = useState<string>("");
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

  const pushLog = useCallback((msg: string) => {
    // 運用時はコンソールのみに出力（または必要に応じて完全に消去）
    console.log(`[Collage] ${msg}`);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setCollageDataUrl(null);
    setImages({});
    localStorage.removeItem(IMAGES_KEY);
    pushLog("UI Reset for new submission");
  }, [pushLog]);

  const syncPreset = useCallback(async () => {
    try {
      const preset = await fetchAssignedPreset();
      if (preset) {
        if (presetId && preset.id !== presetId) {
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`New preset detected: ${preset.id}.`);
        } else if (!presetId) {
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`Initial preset synced: ${preset.id}`);
        }
      }
    } catch (e) { pushLog(`Sync error in poll: ${String(e)}`); }
  }, [presetId, pushLog]);

  useEffect(() => {
    const timer = setInterval(() => {
      void syncPreset();
    }, 10000);
    return () => clearInterval(timer);
  }, [syncPreset]);

  useEffect(() => {
    try {
      pushLog("--- Collage App Mounted ---");
      
      let uid = localStorage.getItem(USER_ID_KEY);
      if (!uid) {
        uid = `user_${Math.random().toString(36).slice(2, 11)}`;
        localStorage.setItem(USER_ID_KEY, uid);
      }
      setUserId(uid);

      const savedCount = localStorage.getItem(SUBMISSION_COUNT_KEY);
      if (savedCount) setSubmissionCount(parseInt(savedCount, 10));

      const savedHistory = localStorage.getItem(HISTORY_KEY);
      if (savedHistory) {
        try {
          setCollageHistory(JSON.parse(savedHistory));
        } catch (e) {
          pushLog("History restoration failed");
        }
      }

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
        void syncPreset();
      }

    } catch (globalError) {
      pushLog(`CRITICAL MOUNT ERROR: ${String(globalError)}`);
    }
  }, [pushLog, syncPreset]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, polygonId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const optimized = await compressImage(file, pushLog);
      setImages(prev => {
        const next = { ...prev, [polygonId]: optimized };
        localStorage.setItem(IMAGES_KEY, JSON.stringify(next)); 
        return next;
      });
      pushLog(`Success: ${polygonId} set`);
    } catch (e) {
      pushLog(`Error during capture: ${String(e)}`);
      setErrorMessage(`画像の読み込みに失敗しました: ${String(e)}`);
    } finally {
      event.target.value = "";
    }
  };

  const submit = async () => {
    if (!template || !presetId) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      pushLog("Generating collage image...");
      const generatedUrl = await generateCollageImage(template, images);
      setCollageDataUrl(generatedUrl);

      const res = await submitCollageData({
        userId,
        templateId: template.id,
        presetId: presetId,
        collageDataUrl: generatedUrl,
        items: template.polygons.map(p => ({
          polygonId: p.id, theme: themeMap[p.id] || "", dataUrl: images[p.id] || ""
        })),
      });
      setResult(res);
      
      const newCount = submissionCount + 1;
      setSubmissionCount(newCount);
      localStorage.setItem(SUBMISSION_COUNT_KEY, newCount.toString());
      
      // 履歴に追加
      const historyItem: CollageHistoryItem = {
        id: res.id,
        dataUrl: generatedUrl,
        createdAt: new Date().toISOString(),
        placementLabel: res.placementLabel,
      };
      const newHistory = [historyItem, ...collageHistory];
      setCollageHistory(newHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));

      localStorage.removeItem(IMAGES_KEY);
      pushLog("Submission complete.");

    } catch (e: any) { 
      pushLog(`Submit failed: ${String(e)}`);
      setErrorMessage(`${e}`); 
    } finally { 
      setSubmitting(false); 
    }
  };

  return { template, themeMap, images, errorMessage, submitting, result, collageDataUrl, alreadySubmitted, submissionCount, handleFileChange, submit, reset, pushLog };
}
