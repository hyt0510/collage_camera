# 📸 Collage Camera (文化祭向け 参加型コラージュ投影システム)

## 📌 プロジェクト概要 (Overview)
文化祭（高専祭）のイベント向けに開発された、参加型のリアルタイム・コラージュ作成・投影Webアプリケーションです。
来場者が自身のスマートフォンからテーマに沿った写真を撮影し、1枚のコラージュ画像を作成。投稿された写真は、会場に設置された大型モニター上にリアルタイムで反映され、最終的に全参加者の写真が集まって巨大な「COLLAGE」の横文字（モザイクアート）が完成します。

## 🚀 主な機能と特徴 (Features)

### 📱 参加者向けWebアプリ (User App - `/`)
- **Webカメラ撮影・プレビュー**: ブラウザ（HTML5）のカメラAPIを利用し、専用のオーバーレイUIで撮影可能。
- **ポリゴン（多角形）コラージュ生成**: SVGのクリッピングパスとCanvas APIを組み合わせ、クライアントサイドで画像を自動トリミング＆合成。サーバーの負荷を大幅に軽減しています。
- **データ永続化**: IndexedDBを活用し、ページをリロードしても作成中のデータや履歴が消えない堅牢な設計（localStorageの5MB制限を回避）。
- **ワクワクするUI/UX**: 紙の質感、マスキングテープ、指定された8色以内のカラーパレットを用いた、スクラップブック風のポップで目を引くデザイン。

### 🖥️ 会場モニター投影 (Monitor App - `/monitor`)
- **リアルタイム同期**: Firebase Firestoreの `onSnapshot` を利用し、投稿を超低遅延でモニターに反映。
- **巨大モザイクアート（パフォーマンス最適化）**:
  - 全278枠の写真を配置し、全体で「COLLAGE」の文字を描き出す横長（16:9）グリッドレイアウト。
  - パフォーマンス最適化のため、画面全体（2300枠以上）を描画せず、文字を構成する枠（DOMノード）のみを選択的にレンダリング。
  - 写真1枚1枚にランダムな傾き（-10度〜+10度）、スケール、ドロップシャドウ、白フチ（ポラロイド風）を適用し、リアルなコラージュ感をCSSで軽量に再現。
  - 新しい投稿が届いた際の「新着ポップアップアニメーション」を実装。

### ⚙️ 運営管理画面 (Admin Dashboard - `/admin`)
- **投稿管理と自動検閲**: Google Cloud Vision APIを利用した自動検閲（SafeSearch Detection）で不適切な画像を自動非表示。手動での承認・非表示切り替え、景品交換機能（バザー券消込）も完備。
- **リアルタイム設定反映**: 会場の状況に合わせて、参加者へ配信するコラージュの枠線テンプレート（プリセット）を即座に変更可能。

---

## 🛠️ 技術スタック (Tech Stack)

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend / Database**: Firebase (Firestore, Cloud Storage, Authentication)
- **Client-Side Storage**: IndexedDB (idb)
- **Image Processing**: HTML5 Canvas API, SVG
- **AI / Moderation**: Google Cloud Vision API

---

## 📐 アーキテクチャの工夫点

1. **クライアントサイドでの画像合成**
   複数枚の写真をサーバーで合成すると多大な負荷がかかるため、Canvas APIを用いてユーザーのスマートフォン側で最終的な1枚のコラージュ画像に合成してからStorageへアップロードする設計にしました。これにより通信量の削減とサーバーコストの最小化を実現しています。

2. **スケーラブルなモザイク描画**
   モニター画面では、画面全体を64x36のグリッドに分割していますが、空のマスをすべてレンダリングするとブラウザが重くなります。そこで、CSS Gridの `grid-column` と `grid-row` を用いて、必要な箇所（文字を構成する278箇所）の要素のみをレンダリングするアルゴリズムを採用し、アニメーション時のGPU負荷を大幅に削減しました。

---

## 💻 開発環境のセットアップ (Getting Started)

### パッケージのインストール
```bash
bun install
```

### 開発サーバーの起動
```bash
bun run dev
```

### スマホ実機でのデバッグ (ネットワーク経由)
同じWi-Fiに接続したスマホから開くと、カメラ起動や操作感を実機で確認できます。
```bash
bun run dev:mobile
```
1. PCで `ipconfig` (Win) または `ifconfig` (Mac) を実行し、`IPv4` アドレスを確認する。
2. スマホで `http://<PCのIPv4>:3000` を開く。
3. Chrome なら `chrome://inspect`、iPhone Safari なら Mac の Safari Web Inspector でリモートデバッグ可能。

### 環境変数 (`.env.local`)
以下のFirebaseおよびGoogle Cloud Vision APIのキーを設定してください。
```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

GOOGLE_CLOUD_VISION_API_KEY=...

ADMIN_USER=admin
ADMIN_PASSWORD=...
```
