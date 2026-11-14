# 野球ローグライク

ブラウザで遊べる、野球チーム編成型のローグライクゲーム。試合はオート進行で、プレイヤーは打順・守備位置・継投・盗塁の積極度を決めます。勝って選手を獲得・強化し、ライフが尽きる前に全100戦を戦い抜くのが目標です。プレイ終了時に選んだ選手を「ストック」に残し、次のプレイに連れて行けます。

- 仕様：[SPEC.md](SPEC.md)
- 開発のルール：[CLAUDE.md](CLAUDE.md)

## 遊ぶ

GitHub Pages で公開しています：https://kiyoshizundokovic-stack.github.io/test/

### iPhone のホーム画面に追加する
1. Safari で上のURLを開く
2. 共有ボタン（□に↑）→「ホーム画面に追加」
3. ホーム画面のアイコンから起動すると、アプリのように全画面で遊べます（一度開けばオフラインでも遊べます）

データ（進行中のプレイとストック）は端末のブラウザ内に保存されます。Safari とホーム画面のアプリでは保存場所が別なので、移すときはタイトル画面の「データの入出力」で書き出し・読み込みしてください。

## 開発

```sh
npm install
npm run dev        # 開発サーバー
npm test           # テスト
npm run typecheck  # 型チェック
npm run build      # ビルド（dist/）
```

その他のコマンド（バランス検証など）は [CLAUDE.md](CLAUDE.md) を参照してください。

## 公開の仕組み

`main` に push すると GitHub Actions（`.github/workflows/deploy.yml`）がテスト・型チェック・ビルドを行い、GitHub Pages に公開します。プルリクエストではテスト・型チェック・ビルドだけを行います。初回のみ、リポジトリの **Settings → Pages → Source** を **GitHub Actions** にしてください。
