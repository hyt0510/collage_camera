# collage — 来場者の写真で巨大モザイクをつくる文化祭コラージュカメラ

![会場モニターに表示されるモザイク。投稿されたコラージュ278枚で「COLLAGE」の文字ができる](docs/screenshots/monitor-mosaic.jpg)

来場者がスマホで校内の写真を撮ると、1枚のコラージュにまとまって会場の大型モニターへ送られます。投稿が集まるほどモニター上の「COLLAGE」という文字が埋まっていき、278枚そろうと文字が完成します。高専祭（文化祭）のイベント用に作った Web アプリです。

アプリのインストールは不要で、QR コードからブラウザで開けばすぐに参加できます。

| 制作形態 | 個人開発（企画・UI デザイン・フロントエンド・バックエンド・インフラ構築をすべて一人で担当） |
| :--- | :--- |
| 開発期間 | 2026年4月〜7月 |

> スクリーンショットの写真はすべてダミー画像（[Lorem Picsum](https://picsum.photos/)）です。来場者の投稿は含んでいません。

---

## 3つの画面

役割の違う3つの画面で動きます。

| 画面 | パス | 使う人 | 端末 |
| :--- | :--- | :--- | :--- |
| 参加者アプリ | `/` | 来場者 | 自分のスマホ |
| 会場モニター | `/monitor` | 会場にいる全員が見る | 大型モニター（16:9） |
| 運営管理画面 | `/admin` | 運営スタッフ | PC（Basic 認証つき） |

### 1. 参加者アプリ — お題に沿って撮り、1枚のコラージュにする

![参加者アプリの流れ。枠を選ぶ → カメラで撮影 → 全枠が埋まる → 投稿完了](docs/screenshots/flow.jpg)

画面には、多角形に分割されたフレームが表示されます。枠をタップすると「全力で笑ってる写真を撮ろう!!」「時計を撮ろう」のようなお題が出るので、それに合う写真を撮ります。カメラ画面では、撮った写真がどの形に切り抜かれるかを点線で重ねて表示します。

全部の枠が埋まると「作品をモニターに送る」ボタンが出ます。送信したコラージュは端末に保存でき、「履歴」タブからあとで見返せます。

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/user-04-locked.jpg" alt="QRコードを読むまで撮影できないロック中の枠"></td>
    <td width="33%"><img src="docs/screenshots/user-07-unlock.jpg" alt="QRコードを読み取ってロックが解除された通知"></td>
    <td width="33%"><img src="docs/screenshots/collage-result.jpg" alt="生成されたコラージュ画像"></td>
  </tr>
  <tr>
    <td>一部の枠は<b>ロック</b>されています。「中庭のQRコードをスキャンしてください」のように場所が指定されます</td>
    <td>その場所の QR コードを読むと枠が開きます。来場者に会場を回ってもらうための仕掛けです</td>
    <td>投稿されるコラージュ画像（1080×1920）。合成はスマホ側で行います</td>
  </tr>
</table>

### 2. 会場モニター — 投稿が集まるほど文字が完成していく

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/monitor-partial.jpg" alt="投稿が半分ほど集まった途中のモニター"></td>
    <td width="50%"><img src="docs/screenshots/monitor-popup.jpg" alt="新しい投稿が届いたときのポップアップ演出"></td>
  </tr>
  <tr>
    <td>イベント途中の状態。まだ写真が届いていないマスは空いたままです</td>
    <td>新しい投稿が届くと、そのコラージュを画面中央に3秒間大きく表示します</td>
  </tr>
</table>

64×36 のグリッドのうち、「COLLAGE」の文字の形になる278マスにだけ写真を置きます。写真は1枚ずつ少し傾け、白フチと影をつけて、紙の写真を貼り合わせたような見た目にしました。

### 3. 運営管理画面 — 不適切な画像を止め、お題を切り替える

<img src="docs/screenshots/admin.jpg" alt="運営管理画面。投稿一覧と検閲結果、プリセット切り替え" width="720">

投稿は Google Cloud Vision API で自動検閲し、不適切と判定された画像はモニターに出しません（状態が「自動非表示」になります）。スタッフはこの画面から投稿を手動で非表示・削除できるほか、景品交換のための「バザー券消込」もここで記録します。

参加者に配るフレームとお題の組（プリセット）もここで切り替えます。切り替えると、参加者のスマホには次の同期のタイミングで新しいお題が届きます。

---

## 技術スタック

| 分類 | 使用技術 |
| :--- | :--- |
| フレームワーク | Next.js 16（App Router / Turbopack）, React 19, TypeScript |
| スタイリング | Tailwind CSS v4 |
| 認証 | Firebase Authentication（匿名認証） |
| データベース・画像保存 | Cloud Firestore, Cloud Storage for Firebase（サーバーから Firebase Admin SDK で操作） |
| 画像の検閲 | Google Cloud Vision API（SafeSearch Detection） |
| ブラウザ側の保存 | localStorage（撮影途中の写真）, IndexedDB（作成履歴） |
| 画像処理 | Canvas API, CSS `clip-path` |
| ホスティング | Vercel |
| テスト | Vitest（モザイク座標などの純粋関数） |
| パッケージ管理 | Bun |

## システム構成

```mermaid
flowchart LR
  subgraph Phone["来場者のスマホ"]
    A["参加者アプリ /<br/>撮影・コラージュ合成"]
  end
  subgraph Vercel["Next.js（Vercel）"]
    API["Route Handlers<br/>/api/submissions<br/>/api/capture-preset"]
    P["proxy.ts<br/>/admin の Basic 認証"]
  end
  subgraph Google["Google Cloud / Firebase"]
    Auth["Firebase Auth<br/>匿名認証"]
    FS[("Firestore<br/>投稿データ")]
    ST[("Cloud Storage<br/>コラージュ画像")]
    CV["Cloud Vision API<br/>SafeSearch"]
  end
  M["会場モニター /monitor"]
  AD["運営管理画面 /admin"]

  A -- "匿名ログイン" --> Auth
  A -- "コラージュ + 各写真<br/>（ID トークン付き）" --> API
  API -- "検閲" --> CV
  API -- "保存" --> FS
  API -- "画像アップロード" --> ST
  M -- "承認済み投稿を取得" --> API
  AD --> P --> API
```

投稿の流れは次のとおりです。

1. スマホで写真を撮り、端末内で1枚のコラージュに合成する
2. Firebase の匿名認証で得た ID トークンを付けて `/api/submissions` に送る
3. サーバーはトークンを検証し、写真を1枚ずつ Cloud Vision API で検閲する
4. コラージュ画像を Cloud Storage に、投稿データを Firestore に保存する。このときモザイク上の配置マスも決める
5. モニターが承認済みの投稿を取得し、モザイクに配置する

---

## 設計で工夫したこと

### 画像の合成はスマホ側で済ませ、サーバーの負荷と通信量を抑えた

撮った写真は端末上で長辺 800px の JPEG に縮小し、Canvas API で多角形に切り抜いて 1080×1920 の WebP 画像に合成します（[`lib/utils/image.ts`](lib/utils/image.ts)）。サーバーの仕事は検閲と保存だけなので、来場者が同時に投稿しても画像処理の負荷はサーバーに集まりません。

フレームの形は CSS の `clip-path: polygon(...)` で定義しています（[`lib/collage-config.ts`](lib/collage-config.ts)）。同じ定義を画面上の切り抜き表示と Canvas での合成の両方に使うので、プレビューと仕上がりの形がずれません。

### モニターは文字の部分の278マスだけを描画している

モニターは画面を 64×36＝2,304 マスに分けていますが、空のマスまで要素を作ると DOM が増えて、傾きや影のアニメーションが重くなります。そこで「COLLAGE」の各文字を長方形の組み合わせとして座標リストを作り（[`lib/utils/mosaic.ts`](lib/utils/mosaic.ts)）、そのマスだけを CSS Grid の `grid-column` / `grid-row` で直接配置しました。描画する要素は278個で、全マスを並べる場合の約8分の1です。

写真ごとの傾き（−10°〜+10°）と拡大率は、行・列の番号から計算した固定値です。再読み込みしても配置が変わらないので、モニターの見た目が勝手に揺れ動くことはありません。

### Firestore の読み取り回数を、仕組みの側で減らした

モニターや参加者が数秒おきに Firestore を直接読みにいくと、イベント中の読み取り回数（従量課金）が膨らみます。そのため読み取りはすべて Next.js の API を経由させ、次の3つで回数を抑えています。

- **API 側のキャッシュ**: 承認済み投稿の一覧をサーバーのメモリに最長30秒保持する。新しい投稿があった場合だけ、5秒以上たっていれば取り直す
- **時間帯による制限**: イベント時間（日本時間 9:00〜17:00）の外では Firestore を読み直さず、投稿の受付も止める
- **モニターの取得間隔**: モニターは5分おきに一覧を取得する

### クライアントから Firestore へは一切書き込めないようにした

[`firestore.rules`](firestore.rules) でクライアントからの書き込みをすべて拒否し、投稿はサーバーの Admin SDK だけが保存します。サーバーは受け取った Firebase ID トークンを検証してからユーザー ID を取り出すので、他人になりすました投稿はできません。運営管理画面は [`proxy.ts`](proxy.ts)（Next.js 16 で middleware から改名された仕組み）で Basic 認証をかけています。

### 来場者の操作が途中で失われないようにした

撮影途中の写真は localStorage に、作ったコラージュの履歴は IndexedDB に保存します。履歴は画像データなので、容量の上限が 5MB 程度の localStorage ではなく IndexedDB を選びました。ページを再読み込みしても、撮影の途中から再開できます。

運営がプリセットを切り替えたとき、すでに1枚でも撮影している参加者には新しいお題を適用しません。撮りかけのコラージュが突然消えるのを防ぐためです。お題の更新は、10秒ごとの定期確認と、ブラウザのタブに戻ってきた瞬間（`focus` / `visibilitychange`）に確認します。

### 場所限定の枠を、設定ファイルだけで増減できるようにした

どの枠をロックし、どの QR コードで開けるかは [`lib/config.json`](lib/config.json) に書きます。ロック中の案内文と解除時のメッセージも同じファイルで管理するので、会場のレイアウトが変わってもコードを触らずに対応できます。

```jsonc
{
  "id": "festival-classic-a",
  "templateId": "shards-a",
  "themes": ["全力で笑ってる写真を撮ろう!!", "思い出になりそうな一枚", "..."],
  "slotLocks":      { "5": "a_2" },                                // 6番目の枠をロック ID "a_2" で施錠
  "lockMessages":   { "5": "中庭のQRコードをスキャンしてください" },
  "unlockMessages": { "5": "中庭のQRコードをスキャンして解除しました！" }
}
```

QR コードの中身は `https://<ドメイン>/?unlock=a_2` のような URL です。読み取るとロック ID が端末に保存され、URL からパラメータは消えます。

---

## 今後の課題

- **プリセットの選択状態がサーバーのメモリにしかない**: Vercel のサーバーレス環境では、インスタンスが入れ替わると最初のプリセットに戻ることがある。Firestore に保存すれば解決できる
- **モザイクの配置マスがランダムに決まる**: 読み取り回数を減らすため既存の投稿を確認せずにマスを選んでいるので、同じマスに投稿が重なることがある（その場合は新しい投稿が上に表示される）
- **テストが純粋関数に限られている**: モザイク座標などはテストしているが、投稿 API や撮影フローは手動で確かめている

---

## ディレクトリ構成

```text
app/
  page.tsx                 参加者アプリ
  monitor/page.tsx         会場モニター
  admin/page.tsx           運営管理画面
  api/submissions/         投稿の受付・一覧・更新・削除
  api/capture-preset/      プリセットの取得・切り替え
components/features/
  camera/                  カメラ画面（撮影・アルバム選択・権限エラー表示）
  collage/                 多角形フレームと背景装飾
hooks/
  useAuth.ts               Firebase 匿名認証
  useCollageCapture.ts     撮影状態・プリセット同期・投稿処理
lib/
  config.json              お題・プリセット・ロック設定
  collage-config.ts        フレームの形（clip-path）の定義
  moderation.ts            Cloud Vision API による検閲
  submission-store.ts      Firestore / Storage への保存
  utils/                   画像合成、モザイク座標、IndexedDB
proxy.ts                   /admin の Basic 認証
firestore.rules            Firestore のセキュリティルール
```

---

## ローカルで動かす

必要なもの: [Bun](https://bun.sh/)、Firebase プロジェクト（Authentication の匿名認証、Firestore、Storage を有効化）。Cloud Vision API のキーは任意で、未設定なら検閲をスキップして投稿をそのまま表示します。

```bash
bun install
# プロジェクト直下に .env.local を作成（内容は下記）
bun run dev   # http://localhost:3000
bun run test  # ユニットテスト（Vitest）
```

`.env.local` の内容:

```env
# サーバー側（Firebase Admin SDK）
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# クライアント側（Firebase JS SDK）
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# 画像の検閲（任意。未設定または "skip" で無効）
GOOGLE_CLOUD_VISION_API_KEY=...

# 運営管理画面の Basic 認証
ADMIN_USER=admin
ADMIN_PASSWORD=...
```

投稿の受付は日本時間 9:00〜17:00 に限っています。時間外に動作を確かめるときは、[`app/api/submissions/route.ts`](app/api/submissions/route.ts) の `checkIsEventTime()` を一時的に変更してください。

### スマホの実機で確かめる

カメラの動作は実機で確かめるのが確実です。PC と同じ Wi-Fi につないだスマホから開けるように、外部からの接続を受け付けるモードで起動します。

```bash
bun run dev:mobile
```

1. PC で `ipconfig`（Windows）または `ifconfig`（Mac）を実行し、IPv4 アドレスを確認する
2. スマホのブラウザで `http://<PCのIPv4アドレス>:3000` を開く
3. 画面を調べたいときは、Android なら PC の Chrome で `chrome://inspect`、iPhone なら Mac の Safari の Web インスペクタを使う

なお、ブラウザは HTTPS か localhost でないとカメラの使用を許可しません。IP アドレスで開いてカメラが起動しない場合は、アルバムから写真を選ぶボタンで動作を確かめられます。
