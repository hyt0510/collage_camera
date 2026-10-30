"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveHistoryToDB } from "@/lib/utils/idb";

type Submission = {
  id: string;
  createdAt: string;
  status: "approved" | "pending_manual" | "hidden_auto" | "hidden_manual";
  prizeRedeemedAt: string | null;
  placement: { label: string };
  collageDataUrl?: string;
  moderation?: { source: string; reason: string; safe: boolean | null };
  items: Array<{
    theme: string;
    dataUrl?: string;
    moderation?: { source: string; reason: string; safe: boolean | null };
  }>;
};

type PresetSummary = {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  themes: string[];
};

type ActivePreset = {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  themes: string[];
};

const statusLabels: Record<Submission["status"], string> = {
  approved: "表示中",
  pending_manual: "手動確認待ち",
  hidden_auto: "自動非表示",
  hidden_manual: "手動非表示",
};

// 一覧の絞り込み。「非表示」は自動・手動をまとめる
type StatusFilter = "all" | "pending_manual" | "approved" | "hidden";

const statusFilters: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "すべて" },
  { key: "pending_manual", label: "手動確認待ち" },
  { key: "approved", label: "表示中" },
  { key: "hidden", label: "非表示" },
];

function matchesStatusFilter(status: Submission["status"], filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "hidden") return status === "hidden_auto" || status === "hidden_manual";
  return status === filter;
}

export default function AdminPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePreset, setActivePreset] = useState<ActivePreset | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [error, setError] = useState("");
  // 取得に失敗したときは件数を「0件」と誤表示しない
  const [submissionsFailed, setSubmissionsFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [prizeRedemptionCount, setPrizeRedemptionCount] = useState<number | null>(null);
  const [copyResult, setCopyResult] = useState<{ id: string; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [submissionsResponse, presetsResponse] = await Promise.all([
        fetch("/api/submissions?scope=all", { cache: "no-store" }),
        fetch("/api/capture-preset", { cache: "no-store" }),
      ]);
      const submissionsPayload = (await submissionsResponse.json()) as
        | { submissions: Submission[]; prizeRedemptionCount: number | null }
        | { error: string };
      const presetsPayload = (await presetsResponse.json()) as
        | { presets: PresetSummary[]; activePreset: ActivePreset }
        | { error: string };

      // 片方が失敗しても、取得できた方は画面に反映する
      const errors: string[] = [];
      if (submissionsResponse.ok && "submissions" in submissionsPayload) {
        setSubmissions(submissionsPayload.submissions);
        setPrizeRedemptionCount(submissionsPayload.prizeRedemptionCount);
        setSubmissionsFailed(false);
      } else {
        errors.push("投稿一覧の取得に失敗しました。");
        setSubmissionsFailed(true);
        setPrizeRedemptionCount(null);
      }
      if (presetsResponse.ok && "presets" in presetsPayload) {
        setPresets(presetsPayload.presets);
        setActivePreset(presetsPayload.activePreset);
        setSelectedPresetId((current) => current || presetsPayload.activePreset.id);
      } else {
        errors.push("プリセットの取得に失敗しました。");
      }
      setError(errors.join(" "));
    } catch (err) {
      console.error("Admin refresh error:", err);
      setError("ネットワークエラーまたはサーバーエラーが発生しました。");
      setSubmissionsFailed(true);
      setPrizeRedemptionCount(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 管理画面のポーリングを30秒に延長 (Firestoreの読み取りを節約するため。必要な時は手動リロードも可能)
    const timerId = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timerId);
  }, [refresh]);

  async function copySubmissionId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopyResult({ id, message: "コピーしました" });
    } catch {
      setCopyResult({ id, message: "コピーできませんでした。IDを長押し、または選択してコピーしてください。" });
    }
  }

  async function mutate(id: string, action: "approve" | "hide") {
    const response = await fetch(`/api/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      setError("操作に失敗しました。");
      return;
    }
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm("本当にこの投稿を削除しますか？\n(Storageからも画像が削除されます)")) return;
    
    const response = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("削除に失敗しました。");
      return;
    }
    await refresh();
  }

  async function removeAll() {
    if (!confirm("【警告】すべての投稿を削除しますか？\n(すべての画像データがStorageから削除され、復元できません)")) return;
    
    const response = await fetch("/api/submissions", { method: "DELETE" });
    if (!response.ok) {
      setError("一括削除に失敗しました。");
      return;
    }
    await refresh();
  }

  async function assignPreset() {
    if (!selectedPresetId) {
      setError("割り当てるプリセットを選択してください。");
      return;
    }

    const response = await fetch("/api/capture-preset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetId: selectedPresetId }),
    });
    if (!response.ok) {
      setError("プリセット割り当てに失敗しました。");
      return;
    }
    await refresh();
  }

  const filterCounts = useMemo(
    () => Object.fromEntries(
      statusFilters.map(({ key }) => [
        key,
        submissions.filter((submission) => matchesStatusFilter(submission.status, key)).length,
      ]),
    ) as Record<StatusFilter, number>,
    [submissions],
  );
  const pendingCount = filterCounts.pending_manual;

  const filteredSubmissions = useMemo(
    () => submissions.filter((submission) => matchesStatusFilter(submission.status, statusFilter)),
    [submissions, statusFilter],
  );

  async function resetClientState() {
    if (!confirm("このブラウザのテスト用データ（撮影回数、ロック解除状態、撮影中の画像、履歴など）をリセットしますか？")) return;
    try {
      localStorage.removeItem("collage_v10_img");
      localStorage.removeItem("collage_v10_preset");
      localStorage.removeItem("collage_v10_count");
      localStorage.removeItem("collage_v10_unlocked_qrs");
      localStorage.removeItem("collage_v10_history");
      
      await saveHistoryToDB([]);
      alert("自身のテスト状態（撮影回数・ロック・履歴）をリセットしました！");
    } catch (e) {
      console.error(e);
      alert("ローカルストレージのリセットに成功しましたが、IndexedDBの履歴リセットに失敗しました。");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-4">
      <header className="rounded-2xl bg-white p-4 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">運営管理画面</h1>
          <p className="mt-1 text-sm text-zinc-600">
            手動審査待ち:{" "}
            {submissionsFailed ? (
              <span className="font-semibold">—</span>
            ) : (
              <>
                <span className="font-semibold">{pendingCount}</span> 件
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            景品交換済み:{" "}
            <span className="font-semibold">{prizeRedemptionCount ?? "—"}</span> 人
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetClientState}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            自身のテスト状態をリセット
          </button>
          <button
            onClick={removeAll}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            全投稿を一括削除
          </button>
        </div>
      </header>

      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      ) : null}

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">参加者画面の割り当てプリセット</h2>
        <p className="mt-1 text-sm text-zinc-600">
          現在:{" "}
          <span className="font-semibold">
            {activePreset ? `${activePreset.name} (${activePreset.templateName})` : "未設定"}
          </span>
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedPresetId}
            onChange={(event) => setSelectedPresetId(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800"
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} / {preset.templateName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={assignPreset}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            このプリセットを割り当てる
          </button>
        </div>
      </section>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="状態で絞り込む">
        {statusFilters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            aria-pressed={statusFilter === key}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              statusFilter === key
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700 shadow-sm hover:bg-zinc-100"
            }`}
          >
            {label} {submissionsFailed ? "—" : filterCounts[key]}
          </button>
        ))}
      </nav>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSubmissions.map((submission, index) => {
          const previewUrl = submission.collageDataUrl || submission.items?.[0]?.dataUrl;
          const previewTheme = submission.items?.[0]?.theme;
          const moderation = submission.moderation ?? submission.items?.[0]?.moderation;
          return (
            <article
              key={submission.id || `sub-${index}`}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
            >
              <div className="aspect-[9/16] w-full bg-zinc-200">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={previewTheme || "collage"}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-2 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 select-all break-all font-semibold text-zinc-900">{submission.id}</p>
                  <button
                    type="button"
                    onClick={() => void copySubmissionId(submission.id)}
                    aria-label={`識別ID ${submission.id} をコピー`}
                    className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    コピー
                  </button>
                </div>
                <p role="status" className="text-xs text-zinc-600">{copyResult?.id === submission.id ? copyResult.message : ""}</p>
                <p className="text-zinc-600">状態: {statusLabels[submission.status]}</p>
                <p className="text-zinc-600">配置: {submission.placement.label}</p>
                <p className="text-zinc-600">
                  検閲: {moderation?.source} / {moderation?.reason}
                </p>

                <p className="text-zinc-600">
                  {/* 交換記録を読めなかったときは「未」と誤って見せない */}
                  景品: {prizeRedemptionCount === null
                    ? "—"
                    : submission.prizeRedeemedAt
                      ? `交換済み ${new Date(submission.prizeRedeemedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                      : "未"}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => mutate(submission.id, "approve")}
                    className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    承認して表示
                  </button>
                  <button
                    type="button"
                    onClick={() => mutate(submission.id, "hide")}
                    className="rounded-md bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
                  >
                    非表示
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(submission.id)}
                    className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    削除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
