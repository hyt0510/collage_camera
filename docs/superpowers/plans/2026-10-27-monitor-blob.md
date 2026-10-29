# モニターBlob配信 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 参加者の取得回数からFirebaseアクセスを切り離し、無料枠上限時に配信を止める。

**Architecture:** 非公開Blobに全体JPEGと更新時刻をまとめて保存し、既存GETはBlobだけを読む。認証済みPOSTだけがFirestoreの永続予約と承認一覧を確認し、非表示操作と共有ロックで直列化する。

**Tech Stack:** Next.js 16、React 19、TypeScript、Firebase Admin、@vercel/blob、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-27-monitor-blob-design.md`（ユーザーが実装・依存・管理データ・ストア作成を承認済み。デプロイは別確認。）

## Global Constraints

- 更新最短60秒、イベント全体1,500予約、画像90秒期限、2026年11月1日23:59 JSTに公開終了。
- JPEG最大200,000バイト、Blob JSON最大300,000バイト。GETからFirebaseを呼ばず、障害時にフォールバックしない。
- スマホは180秒の絶対期限。非表示・復帰で期限を延ばさない。
- 新規依存は@vercel/blobのみ。承認ファイルだけ編集し、他セッションの差分を保持する。
- @vercel/blob読取はuseCache:false。トークンは専用のMONITOR_BLOB_READ_WRITE_TOKENを使い、表示・コミットしない。

## Review Focus

- GETのキャッシュミス・条件付き取得・Blob障害でFirebaseに接続しない（タスク2）。
- タイムアウトしたputの早期ロック解放後に、非表示を成功扱いにしない（タスク1、3）。
- 壊れた管理データ・別イベント・時間境界で上限をリセットしない（タスク1）。
- 閉じた画面への応答・スリープ復帰・再開で180秒をすり抜けない（タスク4）。
- 再起動と同時更新、削除失敗で古い写真を再公開しない（タスク1、2、3）。

## タスク1：永続予約

**Files:** `lib/monitor-preview-budget.ts`、同 `.test.ts`（新規）。

**Interfaces:** `reserveMonitorPreviewPublication(startedAt: number): Promise<string>`、`completeMonitorPreviewPublication(id: string): Promise<void>`、`assertMonitorPreviewIdle(): Promise<void>`。`MonitorPreviewBudgetError`は既存OperationBusyErrorを継承し、reasonでlimit/interval/pending/expiredを区別する。

- [x] テストを追加：1,500回境界、60秒境界、同時予約、別イベント・不正データ、予約後の保留、ID不一致の解除拒否、90秒後の解放を確認する。
- [x] 対象テストを実行して未実装の失敗を確認する。
- [x] settings/monitorPreviewBudgetのトランザクションを実装。失敗予約は返却せず、pendingUntilはstartedAt+90秒。
- [x] 対象テストを再実行する。

## タスク2：Blob配信

**Files:** `package.json`、`bun.lock`、`lib/monitor-preview-store.ts`、同 `.test.ts`、`app/api/monitor-preview/route.ts`、同 `.test.ts`。

**Interfaces:** 既存`saveMonitorPreview(buffer, ids): Promise<boolean>`、`getMonitorPreview(): Promise<{buffer, updatedAt, etag} | null>`を維持。`withMonitorPreviewInvalidation<T>(operation: () => Promise<T>): Promise<T>`を追加。

- [x] bunで@vercel/blobのみ追加し、SDK型を確認する。
- [x] テストをBlobモックへ置換。GETでFirebaseモックを呼ばない、90秒期限、破損JSON・JPEG・容量、認証・クエリ拒否、上限応答、失敗put保留を確認して失敗を観測する。
- [x] 非公開JSON保存、上限予約、useCache:false読取、300KBストリーム上限、時刻・ハッシュ・JPEG検証、失効ラッパーを実装する。
- [x] GETクエリ拒否をBlob呼出し前に行い、POSTの上限/一時停止を区別する。公開終了優先は維持する。
- [x] 対象テストを再実行する。

## タスク3：非表示との直列化

**Files:** `lib/submission-store.ts`、同 `.test.ts`。

**Interfaces:** タスク2の`withMonitorPreviewInvalidation`を使用する。

- [x] hide/deleteが共有処理を通る、保留中は状態を変更しない、Blob失効失敗を成功扱いにしないテストを追加し、失敗を確認する。
- [x] 既存の投稿単位ロックを外側、プレビュー共有ロックを内側にして非表示・削除を包む。公開側の承認確認は直接listApprovedSubmissionsを使う。
- [x] 承認・非公開化失敗など既存のテストと合わせて再実行する。

## タスク4：運営60秒更新とスマホ180秒停止

**Files:** `hooks/useMonitorPreviewPublisher.ts`、`hooks/useMonitorPreview.ts`、`components/features/collage/MonitorPanel.tsx`、`lib/utils/monitor-preview-session.ts`、同 `.test.ts`。

**Interfaces:** 純粋関数`getMonitorPreviewSessionDeadline(startedAt: number): number`、`isMonitorPreviewSessionExpired(deadline: number, now?: number): boolean`。hookの戻り値にpaused状態とresume関数を追加する。

- [x] 180秒直前・一致・超過、手動再開の新期限を純粋関数テストで確認し、未実装の失敗を確認する。
- [x] hookで絶対期限タイマーと通信中止を実装。非表示復帰で期限を延長せず、閉鎖後は画像・再開操作を消す。
- [x] MonitorPanelに停止中・最終更新時刻と再開ボタンを追加。publisherは60秒とし、総量上限では繰返しを停止する。
- [x] 単体テストとブラウザーで停止・再開・非表示復帰を確認する。

## タスク5：ストア設定と全体検証

- [x] HobbyチームのBlob利用状況を確認し、専用非公開ストアを作成する。専用トークンをサーバー環境に設定し、値を出力しない。既存環境変数は上書きしない。
- [x] `npm test`（fork終了の権限問題があれば`npm test -- --pool=threads`）、変更対象lint、`bunx tsc --noEmit`を実行する。
- [x] テスト画像で実Blobの保存・取得・失効・直接URL拒否を確認する。実参加者画像や本番負荷試験は使わない。
- [x] 新しいレビュー担当が今回の差分を確認し、重大な指摘を修正・再検証する。
- [x] 変更ファイル・成功失敗件数・制限を報告し、デプロイだけ最終確認する。

## 実行記録

- 2026-10-27：ユーザーの「進めて」を設計の実装許可として実行開始。追加の計画承認は求めず、このセッションで順に実装する。
- 作業ブランチはfeat/monitor-blob-delivery。共有作業ツリーには承認対象外の変更が多いため、まとめてコミット・stash・リセットしない。
- タスク1〜4実装済み。上限・保留・期限・失効の失敗テストから実装し、対象テストを成功させた。
- 非公開Blob store_KBbXsQ3rrKSOVaLZ（collage-monitor-2026、hnd1）をHobbyチームに作成。MONITOR_BLOB_READ_WRITE_TOKENをProduction/Preview/Developmentへ登録。値は非表示。
- 他の開発サーバーを止めないため、秘密ファイルを除いた一時コピーでAPIとMonitorPanelを検証。既存Playwrightを使用し、依存追加なし。
- 実Blobの合成JPEGで、API200・直接URL403・不正クエリ400・90秒期限切れ404・削除後取得不能を確認。テストBlobは削除済み。実Firestoreへの公開予約は行っていない。
- 最終レビューでpublisherの上限停止がsourceKey変更で解除される指摘を受けた。PlaywrightでPOST2回の失敗を再現し、refによる停止保持へ修正してPOST1回で合格。180秒停止・再開・非表示復帰・pageerror0も確認。
- Ruling: SDK内部のHTTP再試行数は1,500予約とは別であるため、Advanced Operationsの厳密な使用数とは説明しない。Hobbyの無料枠到達時停止に依存し、設計書へ制約を追記した。
- 共有ツリーのブランチ名は他セッションが切り替えるため、最後に強制的に戻さず、今回の変更だけをファイル単位で報告する。
- 最終検証：npm testは310成功・0失敗。ただしfork終了でkill EPERMを記録。npm test -- --pool=threadsは310成功・0失敗、終了コード0。型チェック合格、対象lintエラー0・既存img警告1、本番ビルド合格。
- 最終ブラウザー確認：390×844、実MonitorPanelとpublisherを使う一時ページで、180秒停止・手動再開・非表示復帰・上限後sourceKey変更・公開終了優先を確認。pageerror0。APIはモックし、Firebaseへの負荷なし。
- ローカル既存サーバーの環境変数・.env.localは変更していない。実BlobのAPI検証は専用トークンをプロセス内に設定した一時サーバーで実施。Vercelの設定は済んでいるが、アプリ本番へは未デプロイ。
