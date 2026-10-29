# モニター演出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 会場・スマホで写真が散らばり、2分周期でCOLLAGEへ集まる。演出のフレームに通信を発生させない。

**Architecture:** 共通の座標関数・表示コンポーネントを使用する。会場で読み込み済みの画像をアトラスJPEGにまとめ、Blobへ既存の上限内で保存し、スマホへ画像と配置情報を1回の応答で渡す。

**Tech Stack:** Next.js 16、React 19、TypeScript、Canvas、CSS transitions、Vitest。追加依存なし。

**Spec:** `docs/superpowers/specs/2026-10-28-monitor-animation-design.md`（ユーザー承認済み）。

## Global Constraints

- 100秒散開、4秒集結、12秒保持、4秒散開。端末で開いた時から開始。
- 空枠なし、最大278枚、既存の紙色とテープ。動きを減らす設定に対応。
- JPEG最大200,000バイト、JSON最大300,000バイト。運営60秒・1,500予約、スマホ30秒確認・180秒停止、90秒鮮度、公開終了を維持。
- GETからFirebaseへ接続しない。アトラスの配置情報に原本URL・UID・投稿IDを含めない。
- 承認済みファイル以外は変更しない。別セッションの差分を保持。デプロイはしない。

## Review Focus

- 同じJPEGでも配置変更でETagが変わる（タスク2、3）。
- 部分的な画像読込失敗・範囲外座標・重複配置を配信しない（タスク1、2、3）。
- 全278枚と少数枚で画面内に収まり、追加で既存写真が跳ねない（タスク1、4）。
- 3分の取得停止後も動きは続き、公開終了は常に優先（タスク4、5）。
- 旧JPEGは旧方式、新JSONはアトラスとして扱い、旧クライアントへ誤ったJPEGを返さない（タスク3、4）。

## タスク1：共通座標と周期

Files: `lib/utils/monitor-animation.ts`・同`.test.ts`。

Interfaces: `MonitorPlacement {row,col}`、`MonitorAtlas {columns,rows,placements}`、`getMonitorAnimationState(elapsed)`、`getMonitorTileLayout(placement,assembled,count)`、`getMonitorAtlasLayout(count)`、`parseMonitorAtlas(value)`。

- [x] 周期境界、全278座標の範囲・安定性、アトラス寸法・不正データの失敗テストを作り実行する。
- [x] 純粋関数を実装し、対象テストを成功させる。

## タスク2：アトラス生成

Files: `lib/utils/monitor-preview.ts`・同`.test.ts`、`hooks/useMonitorPreviewPublisher.ts`。

Interfaces: `createMonitorPreview(container)`は`{version:2,imageDataUrl,submissionIds,atlas}`を返す。固定64pxセル、最大20列、全278枚で1280×896。容量超過時は品質・セル寸法を下げ、JSON全体の容量も検証する。

- [x] 欠損画像拒否、写真の配置順、座標・ID数の一致、JPEG/JSON容量の失敗テストを確認する。
- [x] 現在の画面位置を写す処理を、各画像の正方形切り出しへ置換する。publisherの更新頻度と停止条件は変えない。
- [x] 対象テストを実行する。

## タスク3：新旧配信形式

Files: `lib/monitor-preview-store.ts`・同`.test.ts`、`app/api/monitor-preview/route.ts`・同`route.test.ts`。

Interfaces: `saveMonitorPreview(buffer,ids,atlas?)`。旧版の戻り値は維持し、新版では`atlas`を追加。V2 ETagはJPEGとatlasの両方をハッシュ。GETはV1ならJPEG、V2なら`{version:2,imageDataUrl,atlas}`のJSONを返す。

- [x] V2承認確認、座標数・範囲・重複、メタデータのETag変更、新旧レスポンス、容量・期限・Firebase非接続を失敗テストで確認する。
- [x] 既存の認証・永続予約・共有ロック・90秒失効を維持して実装する。
- [x] 関連テストを実行する。

## タスク4：会場・スマホの共通表示

Files: `components/features/collage/MonitorStage.tsx`（新規）、`hooks/useMonitorAnimation.ts`（新規）、`app/monitor/page.tsx`、`components/features/collage/MonitorPanel.tsx`、`hooks/useMonitorPreview.ts`。

- [x] 共通Stageで原本画像またはアトラスの各領域を描画する。row/colで安定したkeyを使う。CSS transformで移動・拡縮、reduced-motionでは即時切替。
- [x] 周期はタイマーで次の境界だけを更新する。写真の増減やデータ更新で周期をリセットしない。
- [x] 会場の空枠を除去し、既存の新着3秒表示と日本語案内を維持する。
- [x] スマホで300KB上限内のJSONを読み、JPEGへ復元したBlob URLとatlasをStageへ渡す。旧JPEGは静止画。180秒停止・再開・非表示復帰・終了日時を維持する。

## タスク5：実画面と全体検証

- [x] 既存サーバーに干渉しない一時コピーで、会場1920×1080・スマホ390×844をPlaywright確認する。
- [x] 0・少数・278枚、集結4秒・保持12秒・散開4秒、新着、停止後の動き、終了優先、reduced-motion、通信回数を確認し、画面を目視する。
- [x] 全体npm test、対象lint、型チェック、本番ビルドを行う。
- [x] 最終レビューの重大な指摘を修正し、再検証する。

## 実行記録

- ユーザーが設計書と対象ファイル変更を承認。追加の計画承認を挟まず、このセッションで実装する。
- 基準テストは310成功・0失敗。共有ツリーは未コミットの別作業を含むため、まとめてコミット・リセットしない。
- タスク1〜4実装済み。新規・変更されたテストは合計35件増え、最終全体345件成功・0件失敗。
- publisherは既存のcreateMonitorPreviewの戻り値をそのままJSON化しているため、新形式への対応に追加編集は不要だった。60秒周期・上限後停止は維持。
- Playwrightを既存インストールから使用し、会場1920×1080・スマホ390×844を一時コピーで検証。API・写真をテスト応答に置換し、本番・Firebaseへ負荷をかけていない。
- 278枚の散開・集結・再散開、0枚・10枚・新着3秒表示、スマホの3分取得停止後の演出継続・再開・公開終了、reduced-motion、旧JPEGの確認に成功。画面エラーなし。演出前後で原本画像の取得回数は増えず、POST間隔も維持。
- テスト用アトラスのJSONは255,518バイト。実Canvas生成POSTは最大254,398バイトで、JPEG200KB・JSON300KB以内だった。
- 目視確認：空枠なし、文字の形、会場・スマホの画面内収まり、紙色と既存装飾、写真の切り出し・新着の日本語表示、停止中表示と再開ボタンを確認。スマホで278枚の個別内容を読むことは意図していない。
- 最終コードレビューにCritical/Importantなし。Minorは新規コードの記述密度で、追加変更は行わない。
- npm testの標準実行はnode_modules/.vitest-cache削除時のENOTEMPTYで起動エラー。npm test -- --pool=threads --fsModuleCache=falseでは345成功・0失敗、終了コード0。型チェック・本番ビルド成功。対象lintはエラー0、img警告3。
- 追加の実Blob検証は自動承認レビューが拒否。一時ファイル内の認証情報の出所と接続先への明示承認を確認できないという理由。迂回せず、新形式はAPI自動テストとモックを使う実画面検証で確認した。既存Blob自体の疎通は前段の費用対策で検証済み。
- デプロイ・git push・対象外ファイルの変更は行っていない。
