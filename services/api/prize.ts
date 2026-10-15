export type PrizeStatusResponse = {
  eligible: boolean;
  redeemedAt: string | null;
  // 「景品交換OK」の画面を出せる残り時間（サーバーの時刻で計算）
  ticketRemainingMs: number;
};

export type RedeemPrizeResponse = {
  result: "redeemed" | "already";
  redeemedAt: string;
  ticketRemainingMs: number;
};

export async function fetchPrizeStatus(idToken: string): Promise<PrizeStatusResponse> {
  const response = await fetch("/api/prize", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) throw new Error("景品交換の状態を取得できませんでした。");
  return (await response.json()) as PrizeStatusResponse;
}

export async function redeemPrizeCode(code: string, idToken: string): Promise<RedeemPrizeResponse> {
  let response: Response;
  try {
    response = await fetch("/api/prize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new Error("通信に失敗しました。電波の良い場所で、もう一度読み取ってください。");
  }

  const payload = (await response.json().catch(() => null)) as RedeemPrizeResponse | { error?: string } | null;
  if (!response.ok || !payload || !("result" in payload)) {
    const message = payload && "error" in payload ? payload.error : undefined;
    throw new Error(message || "景品交換に失敗しました。もう一度読み取ってください。");
  }
  return payload;
}
