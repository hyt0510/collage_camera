# 無料枠対策 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 1,000人の参加と連打を想定し、参加者の操作によるFirebase消費を制限する。

**Architecture:** 承認済みの表示情報を1ドキュメントに集約し、承認・非表示と同じトランザクションで更新する。直接Firestoreアクセスを禁止する。参加者APIの受付は無料Redisで判定し、未設定・上限・障害時はFirebaseへ流さず閉じる。

**Tech Stack:** Next.js 16、Firebase Admin、既存のVitest。依存追加なし。

**承認:** ユーザーは2026-10-29の調査結果の対策（firestore.rulesを含む）について「実施して」と指示。無料Redis追加も「追加していいよ」と承認。本番デプロイはしない。

1. [x] 集約ドキュメントの移行・承認・非表示・削除と既存キャッシュを検証する。既存settings/submissionVersionにentriesを集約。初回だけ既存500件を読み、その後は1件を読む。サイズを700KB以下に抑える。非表示時だけ501件を読み補充する。
2. [x] プリセットの同時要求をまとめ、公開応答をCDNで10秒共有する。Firestore直接読み取りを禁止する。
3. [x] 投稿・検閲・参加者APIの全体上限をFirebaseに触れる前に判定する。上限・障害時は新規受付を停止する。無料Redisを作成し、VercelのProduction/Preview/Developmentへ設定を登録。ユーザーのClaim完了報告を受け、再接続試験の成功後にPARTICIPANT_REDIS_READY=trueへ変更済み。アプリは未デプロイ。
4. [x] npm test、型検査、対象Lint、独立レビューを実施する。変更ファイルと本番未反映を報告する。

**制約:** 他セッションの変更を戻さない。秘密情報を出力しない。依存更新・デプロイをしない。無料枠内を確認できない利用を無制限に許可しない。

## 実装済みの上限

- 全プリセットでUIDあたり10投稿・30秒間隔。イベント全体の検閲・保存試行はsettings/submissionBudget2026で1000回まで。失敗・タイムアウトでも全体枠を戻さない。一括削除で全体枠をリセットしない。
- VisionはVISION_FREE_REQUESTS_REMAINING（0〜1000）をサーバー環境変数で明示した場合だけ呼ぶ。運用者が月内の既使用量・他アプリの利用を確認し、残枠以下に設定する。未設定・上限到達・確認失敗時はpending_manualにする。settings/visionBudgetYYYY-MMは再デプロイでもリセットしない。
- RedisのLuaで全環境共通の読み取り40000・書き込み15000をイベント全体に予約。投稿・検閲保存の1000試行上限はFirestore側で確保し、保存済み再送はこの上限に数えない。分あたりは各APIスコープ全体1200・UID30（公開プリセットだけ1200）。UIDはSHA-256化し、画像・氏名・元画像URLをRedisへ送らない。
- 投稿はread20/write14を予約、成功時write12に精算。保存済み再送はread6/write2で精算。不正データは予約前に拒否する。精算IDはLua内で消し、二重返却しない。失敗・タイムアウトは予約を保持する。
- 景品は最大10投稿を取得しread12を予約、成功後に実件数で精算。印刷番号は最大10回の衝突再試行でread30/write2を予約、成功後に実件数で精算。参加者経路のFirestoreトランザクションはmaxAttempts=1にし、内部再試行で予約を超えないようにする。競合時は利用者の再試行が必要で、失敗した予約枠は戻さない。
- 公開プリセットGETもRedisでread1を予約する。モニターGETは引き続きBlobのみ。Redisの無料枠到達・接続障害・設定不備・所有権未確認では503、予算超過では429、終了後は410。
- 上限は参加者APIに対するもの。認証済みの運営操作、会場画面の台数・稼働時間、既使用量、同一GCP課金アカウントの他プロジェクトの利用は別途管理が必要。サービス全体の無料枠を無条件に保証するとは判定しない。

## リソースと確認結果

- 無料Upstash Redisを公式start-redis APIで1つ作成。未Claimでは72時間で消えるため、所有権を確保するまで参加者データは入れず、READY=falseとする。カード登録・有料プラン移行・デプロイはしない。
- URL・トークン・READY=falseを正しいVercelプロジェクトcollage-cameraの3環境へ登録。Production/Previewはsensitive、Developmentはencrypted。ローカル.env.localにも設定。トークン等の値はログに出さない。.env.redis.localもGit管理外。
- PreviewのCLIはstdin利用時にgit_branch_requiredを返したため、公式REST APIへ構造化JSONを標準入力して未登録分だけ作成した。既存値の上書き・--force・upsertは行っていない。
- 実Redisのダミーデータによる最終7検証は成功、失敗0。UID同時40要求で30許可、読み取り予算の最後の20枠に同時20要求（各20枠）で1要求だけ許可、読み書き予算上限、二重精算、終了を検証。テストキーは120秒で失効。
- 旧投稿のメタデータ46件を読み取り集計し、10投稿超のUIDは0件。参加者IDや作品内容は出力していない。独立レビューで確定したP1/P2はなし。
- 最終npm testは43ファイル391件成功・失敗0。対象Lintはエラー0・警告0。型検査成功。本番ビルド成功。依存追加なし。

### 所有権確保後の設定

ユーザーの「紐づけた」を受け、実Redis検証7件成功・失敗0、npm test再実行391件成功・失敗0を確認した。Production/Preview/Developmentとローカル.env.localのPARTICIPANT_REDIS_READYをtrueにした。Sensitive変数のPATCHはvalueだけを送り、既存の名前・対象・機密属性・接続トークンを維持した。Vercel設定の適用は次回デプロイからで、デプロイ・ルール公開・本番データ移行はまだ行っていない。

## Redis対策で変更したファイル

| 役割 | ファイル |
| --- | --- |
| Redis受付とテスト | lib/participant-admission.ts、lib/participant-admission.test.ts、lib/api-protection.ts、lib/api-protection.test.ts |
| API接続と回帰テスト | app/api/capture-preset/route.ts、同route.test.ts、app/api/submissions/route.ts、同route.test.ts、app/api/prize/route.ts、app/api/submissions/[id]/print-code/route.ts、同route.test.ts |
| 読み取り・再試行の上限 | lib/prize-store.ts、lib/prize-store.test.ts、lib/print-code-store.ts、lib/operation-lock.ts、lib/submission-request-store.ts、lib/submission-store.ts、lib/vision-budget.ts |
| 手順・秘密設定 | この手順書、.env.local、.env.redis.local（環境ファイルはGit管理外。値は公開・コミットしない） |

## 初回の本番移行条件（未実施）

旧版はHEAD時点でsubmissionVersionを更新しないため、自動的な整合性回復は保証できない。初回反映は次の順序を必須とする。

1. 本番の参加者投稿と運営の承認・非表示・削除を入口で一時停止する。
2. 旧処理の最大実行時間60秒が過ぎるまで待つ。旧デプロイURLからの書き込みも停止・保護する。
3. 新版に切り替え、settings/submissionVersionのentriesだけを除去して集約を再作成する。投稿本体・全体予算は消さない。
4. 非表示・削除済み作品が表示されないことを検証して受付を再開する。

本番反映・設定変更・データ変更は、この手順と対象を提示したうえで別途確認する。
