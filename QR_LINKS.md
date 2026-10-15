# コラージュカメラ QRコード関連リンク集

ベースURL: `https://collage-camera.vercel.app`

## ロック解除リンク（QRコードに設定するURL）

参加者がスキャンした際に、特定の枠のロックを解除するためのURLです。

*   **文化祭ベーシック A用 (体育館)**
    `https://collage-camera.vercel.app/?unlock=a_1`
*   **文化祭ベーシック A用 (中庭)**
    `https://collage-camera.vercel.app/?unlock=a_2`
*   **4分割用ロック解除**
    `https://collage-camera.vercel.app/?unlock=4_1`
*   **5分割用ロック解除**
    `https://collage-camera.vercel.app/?unlock=5_1`
*   **6分割 (V3) 用ロック解除 A (体育館)**
    `https://collage-camera.vercel.app/?unlock=6_1`
*   **6分割 (V3) 用ロック解除 B (校門)**
    `https://collage-camera.vercel.app/?unlock=6_2`

---

## 景品交換リンク（本部テントに貼る QR コード）

コラージュを投稿した参加者が、アプリの「履歴」タブから読み取ります。1人1回だけ交換でき、読み取ると緑の「景品交換OK」画面が10分間出ます。同じ画面を2回目以降に出すと黄色の「再表示」になるので、スタッフは表示された交換時刻が今さっき（通信のやり直し）かを確かめてください。

*   `https://collage-camera.vercel.app/?prize=<合言葉>`

`<合言葉>` には、Vercel の環境変数 `PRIZE_QR_CODE` と同じ値を入れます。合言葉を変えたら QR を印刷し直してください。未設定の間は交換できません。

---

## デバッグ・リセット用リンク

開発中やテスト時に、ロック状態を元に戻す（再度ロックする）ためのURLです。

*   **すべてのロックをリセット（一番おすすめ）**
    `https://collage-camera.vercel.app/?lock=all`

*   **個別のロックをリセット**
    *   文化祭ベーシックA用リセットA: `https://collage-camera.vercel.app/?lock=a_1`
    *   文化祭ベーシックA用リセットB: `https://collage-camera.vercel.app/?lock=a_2`
    *   4分割用リセット: `https://collage-camera.vercel.app/?lock=4_1`
    *   5分割用リセット: `https://collage-camera.vercel.app/?lock=5_1`
    *   6分割(V3)用リセットA: `https://collage-camera.vercel.app/?lock=6_1`
    *   6分割(V3)用リセットB: `https://collage-camera.vercel.app/?lock=6_2`
