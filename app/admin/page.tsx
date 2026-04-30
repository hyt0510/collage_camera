"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Submission = {
  id: string;
  createdAt: string;
  status: "approved" | "pending_manual" | "hidden_auto" | "hidden_manual";
  redeemed: boolean;
  placement: { label: string };
  collageDataUrl?: string;
  items: Array<{
    theme: string;
    dataUrl: string;
    moderation: { source: string; reason: string; safe: boolean | null };
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

export default function AdminPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePreset, setActivePreset] = useState<ActivePreset | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [submissionsResponse, presetsResponse] = await Promise.all([
        fetch("/api/submissions?scope=all", { cache: "no-store" }),
        fetch("/api/capture-preset", { cache: "no-store" }),
      ]);
      const submissionsPayload = (await submissionsResponse.json()) as
        | { submissions: Submission[] }
        | { error: string };
      const presetsPayload = (await presetsResponse.json()) as
        | { presets: PresetSummary[]; activePreset: ActivePreset }
        | { error: string };

      if (
        !submissionsResponse.ok ||
        !presetsResponse.ok ||
        !("submissions" in submissionsPayload) ||
        !("presets" in presetsPayload)
      ) {
        setError("投稿一覧の取得に失敗しました。");
        return;
      }

      setError("");
      setSubmissions(submissionsPayload.submissions);
      setPresets(presetsPayload.presets);
      setActivePreset(presetsPayload.activePreset);
      setSelectedPresetId((current) => current || presetsPayload.activePreset.id);
    } catch (err) {
      console.error("Admin refresh error:", err);
      setError("ネットワークエラーまたはサーバーエラーが発生しました。");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timerId = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timerId);
  }, [refresh]);

  async function mutate(id: string, action: "approve" | "hide" | "redeem") {
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

  const pendingCount = useMemo(
    () => submissions.filter((submission) => submission.status === "pending_manual").length,
    [submissions],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-4">
      <header className="rounded-2xl bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900">運営管理画面</h1>
        <p className="mt-1 text-sm text-zinc-600">
          手動審査待ち: <span className="font-semibold">{pendingCount}</span> 件
        </p>
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

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {submissions.map((submission) => {
          const previewUrl = submission.collageDataUrl || submission.items[0]?.dataUrl;
          const previewTheme = submission.items[0]?.theme;
          const moderation = submission.items[0]?.moderation;
          return (
            <article
              key={submission.id}
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
                <p className="font-semibold text-zinc-900">{submission.id}</p>
                <p className="text-zinc-600">状態: {statusLabels[submission.status]}</p>
                <p className="text-zinc-600">配置: {submission.placement.label}</p>
                <p className="text-zinc-600">
                  検閲: {moderation?.source} / {moderation?.reason}
                </p>

                <p className="text-zinc-600">消込: {submission.redeemed ? "済み" : "未"}</p>
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
                    onClick={() => mutate(submission.id, "redeem")}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    バザー券消込
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
