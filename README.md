# collage (Next.js)

文化祭向けのコラージュ生成・投影システムの実装です。

## 主要画面

- `/` : 参加者向け撮影・投稿画面（不規則ポリゴン分割、撮り直し、投稿）
- `/monitor` : 投影モニター画面（新着ポップアップ + 3x3 モザイク表示）
- `/admin` : 運営管理画面（承認/非表示/バザー券消込）

## API

- `GET /api/submissions` : 承認済み投稿一覧
- `GET /api/submissions?scope=all` : 全投稿一覧（管理用）
- `POST /api/submissions` : 投稿作成
- `PATCH /api/submissions/:id` : `approve | hide | redeem`
- `GET /api/capture-preset` : 参加者画面へ配信中のプリセット取得
- `PUT /api/capture-preset` : 管理画面から配信プリセットを切替

## 検閲（Cloud Vision）

`GOOGLE_CLOUD_VISION_API_KEY` が設定されている場合、投稿時に SAFE_SEARCH_DETECTION を実行します。  
未設定時は `pending_manual` で保存され、管理画面から手動承認できます。

## 開発

```bash
bun run dev
```

## スマホ実機デバッグ

同じWi-Fiに接続したスマホから開くと、カメラ起動や操作感を実機で確認できます。

```bash
bun run dev:mobile
```

1. PCで `ipconfig` を実行し、`IPv4` アドレスを確認する
2. スマホで `http://<PCのIPv4>:3000` を開く
3. Chrome なら `chrome://inspect`、iPhone Safari なら Mac の Safari Web Inspector でリモートデバッグする

