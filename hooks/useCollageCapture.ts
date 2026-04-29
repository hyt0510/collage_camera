import { useState, useEffect, useCallback } from "react";
import { FrameTemplate, FRAME_TEMPLATES, CAPTURE_THEMES } from "@/lib/collage-config";
import { fetchAssignedPreset, submitCollageData, sendDebugLogToTerminal } from "@/services/api/collage";
import { generateCollageImage, compressImage } from "@/lib/utils/image";

const IMAGES_KEY = "collage_v10_img";
const PRESET_KEY = "collage_v10_preset";
const USER_ID_KEY = "collage_v10_uid";
const SUBMITTED_KEY = "collage_v10_submitted";
const SUBMISSION_COUNT_KEY = "collage_v10_count";

let LOG_CACHE: string[] = [];

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
  const [logs, setLogs] = useState<string[]>(["[System] Initializing hook..."]);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [collageDataUrl, setCollageDataUrl] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submissionCount, setSubmissionCount] = useState(0);

  const pushLog = useCallback((msg: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    setLogs(prev => [line, ...prev].slice(0, 30));
    // サーバーへの送信はバックグラウンドで実行
    setTimeout(() => {
      sendDebugLogToTerminal(line).catch(() => {});
    }, 0);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setCollageDataUrl(null);
    setImages({});
    pushLog("UI Reset for new submission");
  }, [pushLog]);

  const syncPreset = useCallback(async () => {
    try {
      const preset = await fetchAssignedPreset();
      if (preset) {
        // 現在のpresetIdが設定されており、かつサーバーのIDと異なる場合のみリセットを伴う更新を行う
        if (presetId && preset.id !== presetId) {
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`New preset detected: ${preset.id}. Resetting for new session.`);

          // 新しいプリセットが来たので撮影内容をリセット
          setResult(null);
          setCollageDataUrl(null);
          setImages({});
        } else if (!presetId) {
          // 初期化時：単にセットするだけ
          setPresetId(preset.id);
          setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
          setThemeMap(preset.themeMap);
          localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
          pushLog(`Initial preset synced: ${preset.id}`);
        }
      }
    } catch (e) { pushLog(`Sync error in poll: ${String(e)}`); }
  }, [presetId, pushLog]);

  // 定期的にプリセットをチェック
  useEffect(() => {
    const timer = setInterval(() => {
      void syncPreset();
    }, 10000); // 10秒おき
    return () => clearInterval(timer);
  }, [syncPreset]);

  useEffect(() => {
    try {
      pushLog("--- Collage App Mounted ---");
      pushLog(`UserAgent: ${navigator.userAgent}`);
      
      let uid: string | null = null;
      try {
        uid = localStorage.getItem(USER_ID_KEY);
        if (!uid) {
          uid = `user_${Math.random().toString(36).slice(2, 11)}`;
          localStorage.setItem(USER_ID_KEY, uid);
        }
      } catch (e) {
        pushLog("LocalStorage access failed, using session UID");
        uid = `session_${Math.random().toString(36).slice(2, 11)}`;
      }
      setUserId(uid);

      let savedCount: string | null = null;
      try {
        savedCount = localStorage.getItem(SUBMISSION_COUNT_KEY);
      } catch (e) { /* ignore */ }
      
      if (savedCount) {
        setSubmissionCount(parseInt(savedCount, 10));
      }

      let submittedPresetId: string | null = null;
      try {
        submittedPresetId = localStorage.getItem(SUBMITTED_KEY);
      } catch (e) { /* ignore */ }

      // すでに投稿済みであっても、複数回投稿を許可するため、UI表示用のフラグとしてのみ保持
      if (submittedPresetId) {
        setAlreadySubmitted(true);
      }

      let savedImages: string | null = null;
      let savedPreset: string | null = null;
      try {
        savedImages = localStorage.getItem(IMAGES_KEY);
        savedPreset = localStorage.getItem(PRESET_KEY);
      } catch (e) { /* ignore */ }
      
      let hasInProgress = false;
      try {
        if (savedImages && savedPreset) {
          const parsedImages = JSON.parse(savedImages);
          const imgCount = Object.keys(parsedImages).length;
          if (imgCount > 0) {
            const preset = JSON.parse(savedPreset);
            setImages(parsedImages);
            setPresetId(preset.id);
            setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
            setThemeMap(preset.themeMap);
            pushLog(`Resuming: ${imgCount} photos with saved preset`);
            hasInProgress = true;

            // 保存されていたプリセットが投稿済みならフラグを立てる
            if (submittedPresetId === preset.id) {
              setAlreadySubmitted(true);
            }
          }
        }
        } catch (e) { pushLog("Restoration failed"); }

        if (!hasInProgress) {
        const sync = async () => {
          try {
            const preset = await fetchAssignedPreset();
            if (preset) {
              setPresetId(preset.id);
              setTemplate({ id: preset.templateId, name: preset.templateName, polygons: preset.polygons });
              setThemeMap(preset.themeMap);
              try {
                localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
              } catch (e) { /* ignore */ }
              pushLog(`Synced with latest server preset: ${preset.id}`);

              // 最新のプリセットが投稿済みかチェック
              let currentSubmittedId: string | null = null;
              try {
                currentSubmittedId = localStorage.getItem(SUBMITTED_KEY);
              } catch (e) { /* ignore */ }

              if (currentSubmittedId === preset.id) {
                setAlreadySubmitted(true);
                pushLog("Current preset already submitted.");
              } else {
                setAlreadySubmitted(false);
              }
            }
          } catch (e) { pushLog(`Sync error: ${String(e)}`); }
        };
        void sync();
        }

    } catch (globalError) {
      console.error("Critical mount error:", globalError);
      pushLog(`CRITICAL MOUNT ERROR: ${String(globalError)}`);
    }
  }, [pushLog]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, polygonId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    pushLog(`Start: ${file.name} (${Math.round(file.size/1024)}KB)`);

    try {
      // ユーティリティを使用して最初から圧縮された画像を取得する
      const optimized = await compressImage(file, pushLog);

      pushLog(`Optimized: ${Math.round(optimized.length / 1024)}KB`);

      setImages(prev => {
        const next = { ...prev, [polygonId]: optimized };
        try { 
          localStorage.setItem(IMAGES_KEY, JSON.stringify(next)); 
        } catch (e) {
          pushLog("LS save failed (quota?)");
        }
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
      const collageDataUrl = await generateCollageImage(template, images);
      pushLog("Collage image generated.");
      setCollageDataUrl(collageDataUrl);

      const res = await submitCollageData({
        userId,
        templateId: template.id,
        presetId: presetId,
        collageDataUrl,
        items: template.polygons.map(p => ({
          polygonId: p.id, theme: themeMap[p.id] || "", dataUrl: images[p.id] || ""
        })),
      });
      setResult(res);
      
      const newCount = submissionCount + 1;
      setSubmissionCount(newCount);
      localStorage.setItem(SUBMISSION_COUNT_KEY, newCount.toString());
      
      localStorage.removeItem(IMAGES_KEY);
      // PRESETは次の投稿でも使うかもしれないので、新しく取得し直すかそのままにする
      // ここでは一度消して、次の投稿のためにリセットする
      localStorage.removeItem(PRESET_KEY);
      localStorage.setItem(SUBMITTED_KEY, presetId);
      setAlreadySubmitted(true);
      pushLog("Submission complete. Waiting for manual reset or preset change.");

    } catch (e: any) { 
      pushLog(`Submit failed: ${String(e)}`);
      setErrorMessage(`${e}`); 
      if (String(e).includes("ALREADY_SUBMITTED")) {
        setAlreadySubmitted(true);
        localStorage.setItem(SUBMITTED_KEY, presetId);
      }
    } finally { 
      setSubmitting(false); 
    }
  };

  return { template, themeMap, images, logs, errorMessage, submitting, result, collageDataUrl, alreadySubmitted, submissionCount, handleFileChange, submit, reset, pushLog };
}

