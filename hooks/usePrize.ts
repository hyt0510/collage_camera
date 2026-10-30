import { useCallback, useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { fetchPrizeStatus, redeemPrizeCode, type PrizeStatusResponse } from "@/services/api/prize";

/**
 * 景品交換（本部テントのガチャ）の状態と、本部の QR を読んだあとの交換を扱う
 * latestSubmissionId が変わったら（投稿したら）対象かどうかを取り直す
 * onRedeemFromUrl は ?prize= 付きで開かれたときに呼ぶ（結果が見える画面へ切り替えるため）
 */
export function usePrize(user: User | null, latestSubmissionId: string | null, onRedeemFromUrl: () => void) {
  const [status, setStatus] = useState<PrizeStatusResponse | null>(null);
  // 「景品交換OK」の画面を出せる期限（このスマホの時刻）
  const [ticketUntil, setTicketUntil] = useState<number | null>(null);
  // 期限を過ぎたら true。開いている画面は閉じずに「期限切れ」の表示へ切り替える
  const [ticketExpired, setTicketExpired] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  // 交換した直後の1回目でなければ true。スタッフが見分けられるよう画面の色を変える
  const [isReshow, setIsReshow] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState("");
  // 連続で読み取っても二重に送らないよう、state の反映を待たずに止める
  const redeemingRef = useRef(false);

  const applyStatus = useCallback((next: PrizeStatusResponse) => {
    setStatus(next);
    // 残り時間はサーバーの時計で計算済みなので、スマホの時計がずれていても期限は正しい
    setTicketUntil(next.ticketRemainingMs > 0 ? Date.now() + next.ticketRemainingMs : null);
    setTicketExpired(false);
  }, []);

  useEffect(() => {
    if (ticketUntil === null) return;
    const timer = setTimeout(() => setTicketExpired(true), Math.max(0, ticketUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [ticketUntil]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdToken()
      .then(fetchPrizeStatus)
      .then((next) => {
        if (!cancelled) applyStatus(next);
      })
      .catch((e) => console.warn("Prize status fetch failed:", e));
    return () => {
      cancelled = true;
    };
  }, [user, latestSubmissionId, applyStatus]);

  const redeem = useCallback(async (code: string) => {
    if (!user || redeemingRef.current) return;
    redeemingRef.current = true;
    setRedeeming(true);
    setMessage("");
    try {
      const res = await redeemPrizeCode(code, await user.getIdToken());
      applyStatus({ eligible: true, redeemedAt: res.redeemedAt, ticketRemainingMs: res.ticketRemainingMs });
      if (res.ticketRemainingMs > 0) {
        // 通信が途切れて読み直した場合も、5分以内なら OK の画面をもう一度出す（再表示として）
        setIsReshow(res.result === "already");
        setIsTicketOpen(true);
      } else {
        setMessage("景品はすでに交換済みです。");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "景品交換に失敗しました。もう一度読み取ってください。");
    } finally {
      redeemingRef.current = false;
      setRedeeming(false);
    }
  }, [user, applyStatus]);

  // OS のカメラで本部の QR を読み、?prize=... 付きで開かれたときも交換する
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("prize");
    if (!code) return;
    params.delete("prize");
    const newSearch = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
    // effect の中で同期的に state を変えないよう、交換は次のタイミングで始める
    queueMicrotask(() => {
      onRedeemFromUrl();
      void redeem(code);
    });
  }, [user, redeem, onRedeemFromUrl]);

  const openTicket = useCallback(() => {
    setIsReshow(true);
    setIsTicketOpen(true);
  }, []);
  const closeTicket = useCallback(() => setIsTicketOpen(false), []);

  const canShowTicket = ticketUntil !== null && !ticketExpired;

  return { status, ticketUntil, canShowTicket, isTicketOpen, isReshow, redeeming, message, redeem, openTicket, closeTicket };
}
