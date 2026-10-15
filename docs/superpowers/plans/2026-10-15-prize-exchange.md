# 景品交換（ガチャ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** コラージュを1枚以上投稿した来場者が、本部テントに貼った紙の QR をアプリ内で読むと、1回だけ「景品交換OK」の緑の画面を出せるようにする。

**Architecture:** 交換の記録はサーバーが Firestore の `prize_redemptions/{uid}` にトランザクションで作る。緑の画面を出せる残り時間はサーバーの時計で計算して返し、スマホの時計のずれに左右されないようにする。クライアントは hook（`usePrize`）に状態を持たせ、`app/page.tsx` には部品を置くだけにする。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript strict、Tailwind v4、firebase-admin、Vitest（node 環境）

**Spec:** `docs/superpowers/specs/2026-10-15-prize-exchange-design.md`

## Global Constraints

- 回答・コメントは日本語。import は `@/` エイリアス。`any` は使わない。
- 依存パッケージは追加しない。
- 合言葉は環境変数 `PRIZE_QR_CODE`。未設定なら交換 API は 503。
- 緑の画面を出せるのは交換から10分間（`PRIZE_TICKET_DURATION_MS = 10 * 60 * 1000`）。
- 対象条件：`submissions` に `userId` が一致する投稿が1件以上（状態は問わない）。
- 全投稿の一括削除（`deleteAllSubmissions`）では `prize_redemptions` を消さない。
- `firestore.rules`、`lib/config.json`、`.env.local` は変更しない。
- 設定を即時反映させる Route Handler には `export const dynamic = "force-dynamic"`。
- lint は `bun run lint` が変更前から失敗している（526 errors）ため、変更したファイルだけ `bunx eslint <files>` で確かめる。
- コードを変えたら `npm test` を実行し、`Tests  X passed | Y failed` の行をそのまま報告する。

## Review Focus

1. 交換の応答が通信の途中で失われ、来場者が読み直した場合：2回目は `already` になるが、10分以内なら緑の画面をもう一度出せること（Task 1 の `getTicketRemainingMs`、Task 3 で `already` にも残り時間を返す）。
2. スマホの時計がサーバーとずれている場合：緑の画面がすぐ消えたり、出なかったりしないこと（残り時間はサーバーで計算する。Task 1 のテスト）。
3. 同じ人の交換が同時に2回届いた場合：記録は1件だけになること（Task 2 のトランザクション。`tx.create` を使う）。
4. 解除用の QR を景品の読み取りで読んだ場合、またはその逆の場合：別の QR だとわかる文言を出し、何も記録しないこと（Task 4 の `onDetect`）。
5. OS のカメラで `?prize=` 付きの URL を開いた場合：アプリ内で読んだときと同じように交換し、URL から `prize` を消すこと（Task 4 の `usePrize`）。

---

### Task 1: 純粋関数 `lib/utils/prize.ts`

**Files:**
- Create: `lib/utils/prize.ts`
- Test: `lib/utils/prize.test.ts`

**Interfaces:**
- Produces:
  - `PRIZE_TICKET_DURATION_MS: number`
  - `parsePrizeCode(text: string): string | null`
  - `getTicketRemainingMs(redeemedAt: string, now: number): number`
  - `formatRemaining(ms: number): string`（`"m:ss"`）

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import { PRIZE_TICKET_DURATION_MS, formatRemaining, getTicketRemainingMs, parsePrizeCode } from "./prize";

describe("parsePrizeCode", () => {
  it("URL の prize パラメータの値を返す", () => {
    expect(parsePrizeCode("https://example.com/?prize=abc123")).toBe("abc123");
  });

  it("解除用の QR（unlock）なら null を返す", () => {
    expect(parsePrizeCode("https://example.com/?unlock=a_1")).toBeNull();
  });

  it("prize の値が空なら null を返す", () => {
    expect(parsePrizeCode("https://example.com/?prize=")).toBeNull();
  });

  it("URL でない文字列なら null を返す", () => {
    expect(parsePrizeCode("abc123")).toBeNull();
  });
});

describe("getTicketRemainingMs", () => {
  const redeemedAt = "2026-10-15T01:00:00.000Z";
  const at = Date.parse(redeemedAt);

  it("交換した直後は10分を返す", () => {
    expect(getTicketRemainingMs(redeemedAt, at)).toBe(PRIZE_TICKET_DURATION_MS);
  });

  it("3分たったら残り7分を返す", () => {
    expect(getTicketRemainingMs(redeemedAt, at + 3 * 60_000)).toBe(7 * 60_000);
  });

  it("10分ちょうどで0を返す", () => {
    expect(getTicketRemainingMs(redeemedAt, at + PRIZE_TICKET_DURATION_MS)).toBe(0);
  });

  it("10分を過ぎても負の値にはしない", () => {
    expect(getTicketRemainingMs(redeemedAt, at + 60 * 60_000)).toBe(0);
  });

  it("交換時刻が未来でも10分を超えない", () => {
    expect(getTicketRemainingMs(redeemedAt, at - 60_000)).toBe(PRIZE_TICKET_DURATION_MS);
  });

  it("日時として読めなければ0を返す", () => {
    expect(getTicketRemainingMs("broken", at)).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("分と2桁の秒で返す", () => {
    expect(formatRemaining(9 * 60_000 + 5_000)).toBe("9:05");
  });

  it("1秒未満の端数は切り上げる", () => {
    expect(formatRemaining(59_001)).toBe("1:00");
  });

  it("0以下なら 0:00 を返す", () => {
    expect(formatRemaining(-1)).toBe("0:00");
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- lib/utils/prize.test.ts`
Expected: FAIL（`./prize` が見つからない）

- [ ] **Step 3: 実装する**

```ts
/**
 * 景品交換（本部テントのガチャ）に関するユーティリティ
 */

// 交換してから「景品交換OK」の画面を出せる時間
export const PRIZE_TICKET_DURATION_MS = 10 * 60 * 1000;

/**
 * 本部テントの QR コード（`?prize=...` 付きの URL）から合言葉を取り出す。
 * URL でない、または prize パラメータがなければ null。
 */
export function parsePrizeCode(text: string): string | null {
  try {
    return new URL(text).searchParams.get("prize") || null;
  } catch {
    return null;
  }
}

/**
 * 「景品交換OK」の画面を出せる残り時間（ミリ秒）。
 * スマホの時計のずれに左右されないよう、サーバーの時刻で計算する
 */
export function getTicketRemainingMs(redeemedAt: string, now: number): number {
  const at = Date.parse(redeemedAt);
  if (Number.isNaN(at)) return 0;
  const elapsed = Math.max(0, now - at);
  return Math.max(0, PRIZE_TICKET_DURATION_MS - elapsed);
}

/** 残り時間を「m:ss」で表す */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- lib/utils/prize.test.ts`
Expected: PASS（13件）

- [ ] **Step 5: コミット**

```bash
git add lib/utils/prize.ts lib/utils/prize.test.ts
git commit -m "feat: 景品交換の合言葉と残り時間を扱う関数を足す"
```

---

### Task 2: サーバー側ストア `lib/prize-store.ts`

**Files:**
- Create: `lib/prize-store.ts`
- Test: `lib/prize-store.test.ts`

**Interfaces:**
- Produces:
  - `type PrizeStatus = { eligible: boolean; redeemedAt: string | null }`
  - `type RedeemResult = { result: "redeemed" | "already"; redeemedAt: string } | { result: "not_eligible" }`
  - `getPrizeStatus(userId: string): Promise<PrizeStatus>`
  - `redeemPrize(userId: string, now?: Date): Promise<RedeemResult>`
  - `listPrizeRedemptions(): Promise<Record<string, string>>`（UID → redeemedAt）

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Firestore の代わり。交換記録と投稿の有無だけを持つ
const state: { redeemedAt: string | null; hasSubmission: boolean } = { redeemedAt: null, hasSubmission: false };
const created: unknown[] = [];
const redemptionRef = { path: "prize_redemptions/user-1" };
const submissionsQuery = { path: "submissions?userId=user-1" };

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: (name: string) => name === "prize_redemptions"
      ? { doc: () => redemptionRef }
      : { where: () => ({ limit: () => submissionsQuery }) },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (target: unknown) => target === redemptionRef
        ? { exists: state.redeemedAt !== null, get: () => state.redeemedAt ?? undefined }
        : { empty: !state.hasSubmission },
      create: (_ref: unknown, data: unknown) => created.push(data),
    }),
  },
}));

const { redeemPrize } = await import("./prize-store");
const NOW = new Date("2026-10-15T01:00:00.000Z");

describe("redeemPrize", () => {
  beforeEach(() => {
    state.redeemedAt = null;
    state.hasSubmission = false;
    created.length = 0;
  });

  it("投稿がなければ交換しない", async () => {
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "not_eligible" });
    expect(created).toHaveLength(0);
  });

  it("投稿があり未交換なら、交換を記録する", async () => {
    state.hasSubmission = true;
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "redeemed", redeemedAt: NOW.toISOString() });
    expect(created).toEqual([{ redeemedAt: NOW.toISOString() }]);
  });

  it("交換済みなら記録を増やさず、最初の交換時刻を返す", async () => {
    state.hasSubmission = true;
    state.redeemedAt = "2026-10-15T00:30:00.000Z";
    expect(await redeemPrize("user-1", NOW)).toEqual({ result: "already", redeemedAt: "2026-10-15T00:30:00.000Z" });
    expect(created).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- lib/prize-store.test.ts`
Expected: FAIL（`./prize-store` が見つからない）

- [ ] **Step 3: 実装する**

```ts
import "server-only";
import { db } from "./firebase-admin";

/**
 * 景品交換（本部テントのガチャ）の記録。ドキュメント ID は匿名認証の UID
 * 全投稿の一括削除では消さない（誤操作で全員が再び交換できる状態になるのを防ぐため）
 */
const REDEMPTION_COLLECTION = "prize_redemptions";

export type PrizeStatus = {
  // 投稿が1件以上あるか（状態は問わない）
  eligible: boolean;
  redeemedAt: string | null;
};

export type RedeemResult =
  | { result: "redeemed" | "already"; redeemedAt: string }
  | { result: "not_eligible" };

function submissionsOf(userId: string) {
  return db.collection("submissions").where("userId", "==", userId).limit(1);
}

export async function getPrizeStatus(userId: string): Promise<PrizeStatus> {
  const [redemption, submissions] = await Promise.all([
    db.collection(REDEMPTION_COLLECTION).doc(userId).get(),
    submissionsOf(userId).get(),
  ]);
  return {
    eligible: !submissions.empty,
    redeemedAt: (redemption.get("redeemedAt") as string | undefined) ?? null,
  };
}

/**
 * 景品を1回だけ交換する。同時に2回届いても、トランザクションで記録は1件にする
 */
export async function redeemPrize(userId: string, now: Date = new Date()): Promise<RedeemResult> {
  const ref = db.collection(REDEMPTION_COLLECTION).doc(userId);
  return db.runTransaction(async (tx): Promise<RedeemResult> => {
    const redemption = await tx.get(ref);
    if (redemption.exists) {
      return { result: "already", redeemedAt: redemption.get("redeemedAt") as string };
    }

    const submissions = await tx.get(submissionsOf(userId));
    if (submissions.empty) return { result: "not_eligible" };

    const redeemedAt = now.toISOString();
    tx.create(ref, { redeemedAt });
    return { result: "redeemed", redeemedAt };
  });
}

/** 管理画面用。UID ごとの交換時刻 */
export async function listPrizeRedemptions(): Promise<Record<string, string>> {
  const snapshot = await db.collection(REDEMPTION_COLLECTION).get();
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.get("redeemedAt") as string]));
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- lib/prize-store.test.ts`
Expected: PASS（3件）。続けて `bunx tsc --noEmit` でモックの型エラーがないこと。

- [ ] **Step 5: コミット**

```bash
git add lib/prize-store.ts lib/prize-store.test.ts
git commit -m "feat: 景品交換を1人1回だけ記録するストアを足す"
```

---

### Task 3: API `app/api/prize/route.ts` とクライアントの fetch

**Files:**
- Create: `app/api/prize/route.ts`
- Create: `services/api/prize.ts`

**Interfaces:**
- Consumes: `getPrizeStatus`、`redeemPrize`（Task 2）、`getTicketRemainingMs`（Task 1）
- Produces:
  - `GET /api/prize` → `{ eligible, redeemedAt, ticketRemainingMs }`
  - `POST /api/prize` 本文 `{ code }` → 200 `{ result: "redeemed" | "already", redeemedAt, ticketRemainingMs }` / 400・401・409・500・503 `{ error }`
  - `type PrizeStatusResponse = { eligible: boolean; redeemedAt: string | null; ticketRemainingMs: number }`
  - `type RedeemPrizeResponse = { result: "redeemed" | "already"; redeemedAt: string; ticketRemainingMs: number }`
  - `fetchPrizeStatus(idToken: string): Promise<PrizeStatusResponse>`
  - `redeemPrizeCode(code: string, idToken: string): Promise<RedeemPrizeResponse>`（失敗時は利用者向けの文言で `Error` を投げる）

Route Handler は Vitest で扱いにくいため、ここでは単体テストを書かない。ロジックは Task 1・2 でテスト済み。Task 6 の実機確認で通す。

- [ ] **Step 1: Route Handler を書く**

```ts
import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getPrizeStatus, redeemPrize } from "@/lib/prize-store";
import { getTicketRemainingMs } from "@/lib/utils/prize";

// 交換の状態を毎回最新で返す
export const dynamic = "force-dynamic";

/**
 * AuthorizationヘッダーからFirebase IDトークンを検証し、UIDを返す
 */
async function verifyUid(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch (e) {
    console.error("Token verification failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

const UNAUTHORIZED = { error: "認証に失敗しました。ページを再読み込みしてください。" };

export async function GET(request: Request) {
  const uid = await verifyUid(request);
  if (!uid) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    const status = await getPrizeStatus(uid);
    const ticketRemainingMs = status.redeemedAt ? getTicketRemainingMs(status.redeemedAt, Date.now()) : 0;
    return NextResponse.json({ ...status, ticketRemainingMs });
  } catch (e) {
    console.error("GET /api/prize error:", e);
    return NextResponse.json({ error: "景品交換の状態を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const expectedCode = process.env.PRIZE_QR_CODE;
  // 合言葉が未設定のときは、どの QR でも交換できてしまわないよう機能ごと止める
  if (!expectedCode) {
    console.error("[Prize] PRIZE_QR_CODE is not set. Prize exchange is disabled.");
    return NextResponse.json({ error: "景品交換は現在受け付けていません。本部スタッフにお声がけください。" }, { status: 503 });
  }

  const uid = await verifyUid(request);
  if (!uid) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || code !== expectedCode) {
    return NextResponse.json({ error: "本部テントの景品交換QRコードを読み取ってください。" }, { status: 400 });
  }

  try {
    const outcome = await redeemPrize(uid);
    if (outcome.result === "not_eligible") {
      return NextResponse.json(
        { error: "このブラウザで投稿したコラージュが見つかりません。コラージュを1枚投稿してから読み取ってください。" },
        { status: 409 },
      );
    }
    return NextResponse.json({
      result: outcome.result,
      redeemedAt: outcome.redeemedAt,
      ticketRemainingMs: getTicketRemainingMs(outcome.redeemedAt, Date.now()),
    });
  } catch (e) {
    console.error("POST /api/prize error:", e);
    return NextResponse.json({ error: "景品交換に失敗しました。もう一度読み取ってください。" }, { status: 500 });
  }
}
```

- [ ] **Step 2: クライアントの fetch を書く**

```ts
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
```

- [ ] **Step 3: 型チェック**

Run: `bunx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add app/api/prize/route.ts services/api/prize.ts
git commit -m "feat: 景品交換の API を足す"
```

---

### Task 4: 参加者画面（hook・カード・緑の画面）

**Files:**
- Create: `hooks/usePrize.ts`
- Create: `components/features/prize/PrizeCard.tsx`
- Create: `components/features/prize/PrizeTicketScreen.tsx`
- Modify: `app/page.tsx`（import、hook の呼び出し、履歴タブ先頭のカード、景品用の読み取り画面、緑の画面）

**Interfaces:**
- Consumes: `fetchPrizeStatus`、`redeemPrizeCode`、`PrizeStatusResponse`（Task 3）、`parsePrizeCode`、`formatRemaining`（Task 1）、既存 `QrScannerScreen`、`useCollageCapture` の `result`
- Produces:
  - `usePrize(user: User | null, latestSubmissionId: string | null)` → `{ status, ticketUntil, isTicketOpen, redeeming, message, redeem, openTicket, closeTicket }`
  - `<PrizeCard status redeeming message canShowTicket onScan onShowTicket />`
  - `<PrizeTicketScreen until redeemedAt onClose />`

- [ ] **Step 1: `hooks/usePrize.ts` を書く**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { fetchPrizeStatus, redeemPrizeCode, type PrizeStatusResponse } from "@/services/api/prize";

/**
 * 景品交換（本部テントのガチャ）の状態と、本部の QR を読んだあとの交換を扱う
 * latestSubmissionId が変わったら（投稿したら）対象かどうかを取り直す
 */
export function usePrize(user: User | null, latestSubmissionId: string | null) {
  const [status, setStatus] = useState<PrizeStatusResponse | null>(null);
  // 「景品交換OK」の画面を出せる期限（このスマホの時刻）
  const [ticketUntil, setTicketUntil] = useState<number | null>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState("");
  // 連続で読み取っても二重に送らないよう、state の反映を待たずに止める
  const redeemingRef = useRef(false);

  const applyStatus = useCallback((next: PrizeStatusResponse) => {
    setStatus(next);
    // 残り時間はサーバーの時計で計算済みなので、スマホの時計がずれていても期限は正しい
    setTicketUntil(next.ticketRemainingMs > 0 ? Date.now() + next.ticketRemainingMs : null);
  }, []);

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
        // 通信が途切れて読み直した場合も、10分以内なら OK の画面をもう一度出す
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
    void redeem(code);
  }, [user, redeem]);

  const openTicket = useCallback(() => setIsTicketOpen(true), []);
  const closeTicket = useCallback(() => setIsTicketOpen(false), []);

  return { status, ticketUntil, isTicketOpen, redeeming, message, redeem, openTicket, closeTicket };
}
```

- [ ] **Step 2: `components/features/prize/PrizeCard.tsx` を書く**

```tsx
"use client";

import type { PrizeStatusResponse } from "@/services/api/prize";

interface Props {
  status: PrizeStatusResponse | null;
  redeeming: boolean;
  message: string;
  /** 「景品交換OK」の画面をまだ出せるか */
  canShowTicket: boolean;
  onScan: () => void;
  onShowTicket: () => void;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

/**
 * 履歴タブの先頭に出す景品交換のカード。未投稿・交換前・交換済みで表示を変える
 */
export function PrizeCard({ status, redeeming, message, canShowTicket, onScan, onShowTicket }: Props) {
  // 状態を取得するまでは何も出さない（「対象外」と誤って見せないため）
  if (!status) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-zinc-100">
      <h3 className="text-sm font-bold text-zinc-800">景品交換（本部テントのガチャ）</h3>

      {status.redeemedAt ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-white">
            景品交換済み {formatTime(status.redeemedAt)}
          </p>
          {canShowTicket && (
            <button
              type="button"
              onClick={onShowTicket}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold active:scale-95 transition-all shadow-sm"
            >
              交換OKの画面をもう一度出す
            </button>
          )}
        </div>
      ) : status.eligible ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-zinc-600 leading-relaxed">
            本部テントでガチャを1回まわせます。本部に貼ってあるQRコードを読み取り、出た画面をスタッフに見せてください。
          </p>
          <button
            type="button"
            onClick={onScan}
            disabled={redeeming}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all shadow-sm disabled:opacity-60"
          >
            {redeeming ? "確認中..." : "本部のQRコードを読み取る"}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
          コラージュを1枚投稿すると、本部テントでガチャを1回まわせます。
        </p>
      )}

      {message && <p className="mt-2 text-xs font-bold text-rose-700">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 3: `components/features/prize/PrizeTicketScreen.tsx` を書く**

```tsx
"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/utils/prize";

interface Props {
  /** OK の画面を出せる期限（このスマホの時刻） */
  until: number;
  redeemedAt: string;
  onClose: () => void;
}

/**
 * スタッフに見せる「景品交換OK」の全画面。
 * スクリーンショットと見分けられるよう、現在時刻を秒まで動かし、期限が来たら表示を切り替える
 */
export function PrizeTicketScreen({ until, redeemedAt, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = until - now;
  const active = remainingMs > 0;
  const clock = new Date(now).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const redeemedTime = new Date(redeemedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center text-white ${
        active ? "bg-emerald-600" : "bg-zinc-800"
      }`}
    >
      {active ? (
        <>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
            <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white text-5xl font-bold text-emerald-600">
              ✓
            </span>
          </div>
          <div>
            <p className="text-4xl font-bold tracking-wider">景品交換OK</p>
            <p className="mt-2 text-base font-bold">ガチャを1回まわしてください</p>
          </div>
          <p className="font-mono text-5xl font-bold tabular-nums">{clock}</p>
          <p className="text-sm">
            交換 {redeemedTime} ／ この画面はあと {formatRemaining(remainingMs)} 有効
          </p>
          <p className="text-xs text-white/80">この画面を本部スタッフに見せてください</p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold">この画面の有効期限が切れました</p>
          <p className="text-base">景品交換済み {redeemedTime}</p>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full max-w-xs py-3 rounded-xl bg-white/15 border border-white/40 font-bold"
      >
        閉じる
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `app/page.tsx` に組み込む**

import を足す（既存の `parseUnlockCode` の import の下）：

```tsx
import { usePrize } from "@/hooks/usePrize";
import { PrizeCard } from "@/components/features/prize/PrizeCard";
import { PrizeTicketScreen } from "@/components/features/prize/PrizeTicketScreen";
import { parsePrizeCode } from "@/lib/utils/prize";
```

`useCollageCapture` の呼び出しの直後に足す：

```tsx
  const prize = usePrize(user, result?.id ?? null);
  const [isPrizeScannerOpen, setIsPrizeScannerOpen] = useState(false);
```

`handleQrDetected` の `const code = parseUnlockCode(text);` の行の直後に足す（解除用の読み取りで本部の QR を読んだ場合）：

```tsx
    if (!code && parsePrizeCode(text)) return "景品交換のQRコードです。「履歴」タブの景品交換から読み取ってください";
```

`handleQrDetected` の下に、景品用の読み取り処理を足す：

```tsx
  // 本部テントの QR を読んだら交換する。結果は履歴タブのカードと OK の画面に出す
  const handlePrizeQrDetected = (text: string): string | null => {
    const code = parsePrizeCode(text);
    if (!code) return "本部テントの景品交換QRコードを読み取ってください";
    setIsPrizeScannerOpen(false);
    void prize.redeem(code);
    return null;
  };
```

履歴タブの `<h2 ...>作成したコラージュ</h2>` の直前に足す：

```tsx
          <PrizeCard
            status={prize.status}
            redeeming={prize.redeeming}
            message={prize.message}
            canShowTicket={prize.ticketUntil !== null && prize.ticketUntil > Date.now()}
            onScan={() => setIsPrizeScannerOpen(true)}
            onShowTicket={prize.openTicket}
          />
```

既存の `{isScannerOpen && (...)}` の直後に足す：

```tsx
      {/* 本部テントの景品交換 QR の読み取り */}
      {isPrizeScannerOpen && (
        <QrScannerScreen onDetect={handlePrizeQrDetected} onClose={() => setIsPrizeScannerOpen(false)} />
      )}

      {/* スタッフに見せる「景品交換OK」の画面 */}
      {prize.isTicketOpen && prize.ticketUntil !== null && prize.status?.redeemedAt && (
        <PrizeTicketScreen
          until={prize.ticketUntil}
          redeemedAt={prize.status.redeemedAt}
          onClose={prize.closeTicket}
        />
      )}
```

`canShowTicket` の `Date.now()` が lint（`react-hooks/purity`）で弾かれた場合は、`usePrize` に `canShowTicket` を持たせ、`ticketUntil` までの `setTimeout` で false にする形に変える。

- [ ] **Step 5: 検証**

Run: `npm test`、`bunx eslint hooks/usePrize.ts components/features/prize app/page.tsx`、`bunx tsc --noEmit`
Expected: すべて成功。`bun run lint` は変更前から 526 errors で失敗しているため、変更したファイルだけを対象にする

- [ ] **Step 6: コミット**

```bash
git add hooks/usePrize.ts components/features/prize app/page.tsx
git commit -m "feat: 履歴タブから本部のQRを読んで景品交換できるようにする"
```

---

### Task 5: 管理画面の「バザー券消込」を景品交換の表示に置き換える

**Files:**
- Modify: `lib/submission-store.ts`（`Submission.redeemed`、`redeemed: false`、`"redeem"` 操作を外す）
- Modify: `app/api/submissions/[id]/route.ts`（`Action` から `redeem` を外す）
- Modify: `app/api/submissions/route.ts`（`scope=all` で交換時刻を付ける）
- Modify: `app/admin/page.tsx`（型、ボタン、表示、見出しの人数）
- Modify: `scripts/seed-dummy-mosaic.ts`（`redeemed: false` を外す）

**Interfaces:**
- Consumes: `listPrizeRedemptions`（Task 2）
- Produces: `GET /api/submissions?scope=all` の応答に、各投稿の `prizeRedeemedAt: string | null` と全体の `prizeRedemptionCount: number` を足す

- [ ] **Step 1: `lib/submission-store.ts`**

- `Submission` 型の `redeemed: boolean;` を消す
- `createSubmission` の `redeemed: false,` を消す
- `updateSubmissionStatus` の引数を `action: "approve" | "hide",` にし、`if (action === "redeem") await ref.update({ redeemed: true });` を消す

- [ ] **Step 2: `app/api/submissions/[id]/route.ts`**

```ts
type Action = "approve" | "hide";

function isAction(value: unknown): value is Action {
  return value === "approve" || value === "hide";
}
```

エラー文言を `"action は approve/hide のいずれかを指定してください。"` にする。

- [ ] **Step 3: `app/api/submissions/route.ts` の `scope=all`**

import に `import { listPrizeRedemptions } from "@/lib/prize-store";` を足し、`scope === "all"` の分岐を次にする：

```ts
      // 管理用画面はリアルタイム性を優先するためキャッシュしない
      const [submissions, redemptions] = await Promise.all([
        listAllSubmissions().then(withAdminImageUrls),
        listPrizeRedemptions(),
      ]);
      const serialized = submissions.map((submission) => ({
        ...submission,
        items: submission.items.map((item) => ({
          ...item,
          dataUrl: item.imageUrl,
        })),
        collageDataUrl: submission.collageImageUrl,
        // 景品交換は人（UID）ごとなので、同じ人の投稿にはすべて同じ時刻が付く
        prizeRedeemedAt: redemptions[submission.userId] ?? null,
      }));
      return NextResponse.json({ submissions: serialized, prizeRedemptionCount: Object.keys(redemptions).length });
```

- [ ] **Step 4: `app/admin/page.tsx`**

- `Submission` 型の `redeemed: boolean;` を `prizeRedeemedAt: string | null;` にする
- state を足す：`const [prizeRedemptionCount, setPrizeRedemptionCount] = useState<number | null>(null);`
- `refresh` の応答の型を `{ submissions: Submission[]; prizeRedemptionCount: number }` にし、成功時に `setPrizeRedemptionCount(submissionsPayload.prizeRedemptionCount);` を足す
- `mutate` の引数を `action: "approve" | "hide"` にする
- 見出しの「手動審査待ち」の `<p>` の下に足す：

```tsx
          <p className="mt-1 text-sm text-zinc-600">
            景品交換済み:{" "}
            <span className="font-semibold">{prizeRedemptionCount ?? "—"}</span> 人
          </p>
```

- `<p className="text-zinc-600">消込: ...</p>` を次に置き換える：

```tsx
                <p className="text-zinc-600">
                  景品: {submission.prizeRedeemedAt
                    ? `交換済み ${new Date(submission.prizeRedeemedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                    : "未"}
                </p>
```

- 「バザー券消込」のボタン（`onClick={() => mutate(submission.id, "redeem")}`）を消す

- [ ] **Step 5: `scripts/seed-dummy-mosaic.ts`**

`redeemed: false,` の行を消す。

- [ ] **Step 6: 検証**

Run: `npm test`、`bunx eslint lib/submission-store.ts "app/api/submissions" app/admin/page.tsx`、`bunx tsc --noEmit`、`grep -rn "redeem" app lib scripts`
Expected: すべて成功。grep には `prize` 関連（`redeemPrize` など）だけが残る

- [ ] **Step 7: コミット**

```bash
git add lib/submission-store.ts "app/api/submissions/[id]/route.ts" app/api/submissions/route.ts app/admin/page.tsx scripts/seed-dummy-mosaic.ts
git commit -m "feat: 管理画面のバザー券消込を景品交換の表示に置き換える"
```

---

### Task 6: ドキュメントと実機確認

**Files:**
- Modify: `README.md`（72行目の「バザー券消込」の説明）
- Modify: `QR_LINKS.md`（景品交換の QR の節を足す）

- [ ] **Step 1: `README.md` 72行目**

「スタッフはこの画面から投稿を手動で非表示・削除できるほか、景品交換のための「バザー券消込」もここで記録します。」を、次に置き換える：

「スタッフはこの画面から投稿を手動で非表示・削除できます。景品交換（本部テントのガチャ）は参加者が本部の QR を読んで記録し、この画面では交換済みかどうかと交換した人数を確認できます。」

- [ ] **Step 2: `QR_LINKS.md` の「ロック解除リンク」の節の後に足す**

```markdown
## 景品交換リンク（本部テントに貼る QR コード）

コラージュを投稿した参加者が、アプリの「履歴」タブから読み取ります。1人1回だけ交換でき、読み取ると緑の「景品交換OK」画面が10分間出ます。

*   `https://collage-camera.vercel.app/?prize=<合言葉>`

`<合言葉>` には、Vercel の環境変数 `PRIZE_QR_CODE` と同じ値を入れます。合言葉を変えたら QR を印刷し直してください。未設定の間は交換できません。
```

- [ ] **Step 3: 実機確認（`.env.local` に `PRIZE_QR_CODE` をユーザーが足したあと）**

1. `bun run dev` を起動し、`/` で1枚投稿する
2. `/?prize=<合言葉>` を開く → 緑の画面、時計が動く、残り時間が減る
3. もう一度 `/?prize=<合言葉>` を開く → 緑の画面がもう一度出る（10分以内）
4. `/?prize=wrong` → 履歴タブのカードに「本部テントの景品交換QRコードを読み取ってください。」
5. `/admin` → 見出しに「景品交換済み: 1 人」、投稿カードに「景品: 交換済み HH:MM」

- [ ] **Step 4: コミット**

```bash
git add README.md QR_LINKS.md
git commit -m "docs: 景品交換の QR と管理画面の説明を足す"
```
