/** ヘッダーだけでなく本文の取得にも待ち時間の上限を付ける。 */
export async function fetchJson<T = unknown>(url: string, options: RequestInit = {}, timeoutMs = 30_000): Promise<{ response: Response; payload: T | null }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
  });
  const perform = async () => {
    const headers = new Headers(options.headers);
    if (headers.get("Authorization")?.startsWith("Bearer ") && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
      const { getAppCheckToken } = await import("@/lib/firebase");
      const token = await getAppCheckToken();
      if (token) headers.set("X-Firebase-AppCheck", token);
    }
    if (controller.signal.aborted) throw new Error("timeout");
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    const payload = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    }) as T | null;
    return { response, payload };
  };
  try {
    return await Promise.race([perform(), timeout]);
  } catch {
    throw new Error("通信を確認できませんでした。電波の良い場所で、少し待ってからもう一度お試しください。");
  } finally {
    clearTimeout(timer!);
  }
}
