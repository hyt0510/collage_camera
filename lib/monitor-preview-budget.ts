import "server-only";
import { randomUUID } from "node:crypto";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { OperationBusyError } from "@/lib/operation-lock";
import { isMonitorClosed, MONITOR_CLOSES_AT } from "@/lib/monitor-schedule";

export const MONITOR_PREVIEW_MAX_AGE_MS = 90_000;
export const MONITOR_PREVIEW_PUBLISH_INTERVAL_MS = 60_000;
const MAX_PUBLICATIONS = 1_500;

export class MonitorPreviewBudgetError extends OperationBusyError {
  constructor(public readonly reason: "limit" | "interval" | "pending" | "expired") {
    super();
    this.message = {
      limit: "共有用プレビューの更新上限に達しました。",
      interval: "共有用プレビューは60秒間隔で更新します。",
      pending: "画像更新の結果を確認中です。最大90秒後に再試行してください。",
      expired: "プレビューの有効期限を過ぎました。再生成してください。",
    }[reason];
  }
}

function budgetRef() {
  return db.collection("settings").doc("monitorPreviewBudget");
}

function readBudget(snapshot: DocumentSnapshot) {
  if (!snapshot.exists) return { reservedCount: 0, lastReservedAt: 0, pendingId: "", pendingUntil: 0 };
  const reservedCount: unknown = snapshot.get("reservedCount");
  const lastReservedAt: unknown = snapshot.get("lastReservedAt");
  const pendingId: unknown = snapshot.get("pendingId");
  const pendingUntil: unknown = snapshot.get("pendingUntil");
  if (snapshot.get("eventId") !== MONITOR_CLOSES_AT ||
      typeof reservedCount !== "number" || !Number.isSafeInteger(reservedCount) || reservedCount < 0 ||
      typeof lastReservedAt !== "number" || !Number.isFinite(lastReservedAt) || lastReservedAt < 0 ||
      typeof pendingId !== "string" ||
      typeof pendingUntil !== "number" || !Number.isFinite(pendingUntil) || pendingUntil < 0) {
    throw new Error("プレビューの管理データを確認できません。運営に確認してください。");
  }
  return { reservedCount, lastReservedAt, pendingId, pendingUntil };
}

export async function assertMonitorPreviewIdle(): Promise<void> {
  const budget = readBudget(await budgetRef().get());
  if (budget.pendingUntil > Date.now()) throw new MonitorPreviewBudgetError("pending");
}

/** 書き込みに失敗しても回数と保留期限を残し、遅れて完了する書き込みに備える。 */
export async function reserveMonitorPreviewPublication(startedAt: number): Promise<string> {
  const ref = budgetRef();
  const id = randomUUID();
  await db.runTransaction(async (tx) => {
    const budget = readBudget(await tx.get(ref));
    const now = Date.now();
    if (!Number.isFinite(startedAt) || startedAt > now || now - startedAt >= MONITOR_PREVIEW_MAX_AGE_MS || isMonitorClosed(now)) {
      throw new MonitorPreviewBudgetError("expired");
    }
    if (budget.pendingUntil > now) throw new MonitorPreviewBudgetError("pending");
    if (budget.reservedCount >= MAX_PUBLICATIONS) throw new MonitorPreviewBudgetError("limit");
    if (budget.reservedCount > 0 && now - budget.lastReservedAt < MONITOR_PREVIEW_PUBLISH_INTERVAL_MS) {
      throw new MonitorPreviewBudgetError("interval");
    }
    tx.set(ref, {
      eventId: MONITOR_CLOSES_AT,
      reservedCount: budget.reservedCount + 1,
      lastReservedAt: now,
      pendingId: id,
      pendingUntil: startedAt + MONITOR_PREVIEW_MAX_AGE_MS,
    });
  });
  return id;
}

export async function completeMonitorPreviewPublication(id: string): Promise<void> {
  const ref = budgetRef();
  await db.runTransaction(async (tx) => {
    const budget = readBudget(await tx.get(ref));
    if (budget.pendingId === id) tx.update(ref, { pendingId: "", pendingUntil: 0 });
  });
}
