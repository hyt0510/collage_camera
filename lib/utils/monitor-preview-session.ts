/** 再表示や再レンダーでは作り直さず、明示的な再開時だけ期限を作る。 */
export function getMonitorPreviewSessionDeadline(startedAt: number): number {
  return startedAt + 180_000;
}

export function isMonitorPreviewSessionExpired(deadline: number, now = Date.now()): boolean {
  return now >= deadline;
}
