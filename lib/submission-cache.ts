import "server-only";
import { getSubmissionVersion, listApprovedSubmissions, type Submission } from "@/lib/submission-store";

const CACHE_TTL_MS = 5_000;
let cached: Submission[] | null = null;
let cachedVersion: string | null = null;
let expiresAt = 0;
let generation = 0;
let pending: Promise<Submission[]> | null = null;

export function invalidateApprovedSubmissions(): void {
  generation++;
  cached = null;
  pending = null;
}

export async function getApprovedSubmissions(): Promise<Submission[]> {
  if (cached && Date.now() < expiresAt) return cached;
  if (pending) return pending;
  const version = generation;
  const request = (async () => {
    const currentVersion = await getSubmissionVersion();
    const submissions = cached && currentVersion === cachedVersion
      ? cached
      : await listApprovedSubmissions();
    // 管理操作の前に始まった取得で、非表示の投稿をキャッシュに戻さない
    if (generation === version) {
      cached = submissions;
      cachedVersion = currentVersion;
      expiresAt = Date.now() + CACHE_TTL_MS;
    }
    return submissions;
  })();
  pending = request;
  try {
    return await request;
  } finally {
    if (pending === request) pending = null;
  }
}
