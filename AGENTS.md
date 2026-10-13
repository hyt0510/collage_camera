# AGENTS.md

高専祭向けの参加型コラージュ投影 Web アプリ（Collage Camera）。コーディングエージェント向けの指示書です。
人間向けの説明は `README.md`、設計の詳細は `構成.md` を参照してください。

## 必須ルール（例外なし）

1. **回答は日本語で書く。**
2. **コードを変えたら `npm test` を実行し、結果を報告する。** 成功・失敗の件数を書く。失敗したら出力の該当部分も貼る。テストを実行できなかったときは、実行できなかったことと理由を書く。
3. **頼まれたファイル以外は変更しない。** 依頼の達成に別のファイルの変更（`package.json`、lockfile、設定ファイルなど）が必要になったら、変更する前に確認する。ついでの整形・リファクタリング・コメント修正もしない。
4. **わからない点は、作業を始める前に質問する。** 解釈が複数ありうるときは、勝手に1つを選ばず選択肢を示して聞く。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## コマンド

パッケージ管理は **bun**（`bun.lock`）。`npm install` で `package-lock.json` を作らないこと。

| 用途 | コマンド |
| :--- | :--- |
| 依存関係のインストール | `bun install` |
| 開発サーバー | `bun run dev` |
| スマホ実機確認（LAN 公開） | `bun run dev:mobile` |
| テスト（Vitest、1回実行） | `npm test` |
| Lint | `bun run lint` |
| 型チェック | `bunx tsc --noEmit` |
| 本番ビルド | `bun run build` |

## 技術スタック

- Next.js 16（App Router）、React 19、TypeScript（strict）、Tailwind CSS v4
- Firebase（Firestore、Storage）。サーバー側は `firebase-admin`
- Google Cloud Vision API（投稿画像の自動検閲）
- Vitest（単体テスト）

Next.js 16 では `middleware.ts` が `proxy.ts` に改名されています。`/admin` の Basic 認証は [proxy.ts](proxy.ts) にあります。

## ディレクトリ構成

| パス | 役割 |
| :--- | :--- |
| `app/` | ページ（`/` 参加者、`/monitor` 会場モニター、`/admin` 運営）と Route Handler（`app/api/`） |
| `components/features/` | 表示に特化した UI コンポーネント（`camera/`、`collage/`） |
| `hooks/` | 状態管理と投稿フロー（`useCollageCapture.ts` が中心） |
| `services/api/` | クライアントからの fetch 処理と型定義 |
| `lib/` | サーバー側ストア（Firestore）、検閲、設定（`config.json`） |
| `lib/utils/` | 画像処理・座標計算などの純粋関数 |
| `scripts/` | 開発用スクリプト（ダミーデータ投入など） |

## コーディング規約

- コード中のコメントは日本語で書く（既存コードに合わせる）。
- import はパスエイリアス `@/` を使う（`@/lib/...`）。
- 責務の分け方は上の表に従う。`app/page.tsx` にロジックを書き足さず、`hooks/` か `lib/utils/` に置く。
- 画像の合成はクライアント側（Canvas API）で行う設計。サーバー側で画像処理を増やさない。
- 設定を即時反映させる Route Handler には `export const dynamic = "force-dynamic"` を付ける。
- `any` は使わない。API レスポンスには型を付ける。

## テスト

- テストファイルは対象と同じディレクトリに `*.test.ts` で置く（例：`lib/utils/styles.test.ts`）。
- 環境は `node`。コンポーネントをテストするときは jsdom と React Testing Library が必要なので、追加する前に確認する。
- async な Server Component は Vitest で扱えない（Next.js 公式ドキュメントの記載）。
- 新しい純粋関数を `lib/utils/` に足したら、テストも足す。

## 作業の進め方

- **書く前に考える。** 前提を書き出す。もっと単純な方法があれば先に提案する。
- **最小限のコードにする。** 頼まれていない機能、将来のための抽象化、起こりえないエラー処理は書かない。
- **変更は外科的に。** 変更したすべての行が依頼内容に直接つながっていること。自分の変更で不要になった import や変数だけを消す。既存の不要コードに気づいたら、消さずに報告する。
- **検証してから完了と言う。** 作業前に成功の基準を決め、テスト・lint・型チェックで確かめてから報告する。

## 境界

- **常にやる**：`npm test` の実行と結果報告、変更したファイルの一覧の報告。
- **先に確認する**：依存パッケージの追加・更新、`firestore.rules` と `lib/config.json` の変更、Firestore のデータ構造の変更、ファイルの削除。
- **絶対にしない**：`.env.local` の中身の表示やコミット、秘密情報のログ出力、確認なしの `git push`・デプロイ（Vercel）。
