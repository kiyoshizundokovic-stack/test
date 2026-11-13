# CLAUDE.md — 作業ルール

野球ローグライク（ブラウザ / PWA）。Vite + TypeScript + React、テストは Vitest。

## 仕様
- **仕様の正は `SPEC.md`**。実装と食い違ったら SPEC.md に合わせる。
- 仕様変更・追加の決定が出たら、コードと同じコミットで **SPEC.md も更新**する。
- 推測で埋めた点・実装時に決めた点は SPEC.md「10. 決定ログ」に追記し、コミットメッセージにも書く。
- 「【要確認】」や矛盾・不明点は、実装前にユーザーへ質問する。

## 設計ルール
- **ゲームロジックは `src/core/` に置き、React に依存させない**（`react` やDOM APIを import しない）。Node 上で単体実行・テストできること。UI（`src/*.tsx` など）は core を呼ぶだけにする。
- **数値は `src/core/config.ts` に集約する**。能力値の上下限・確率係数・報酬額・生成パラメータなどをロジックにハードコードしない（エンドレスモードでの上限撤廃に備える）。
- **乱数はシード付きPRNG（`src/core/rng.ts` の `Rng`）を使う**。`Math.random()` はゲームロジックで使わない。同じシード・同じ入力なら同じ結果になること。PRNGの状態はセーブデータに保存できる形に保つ。
- 選手などのデータはJSONシリアライズ可能なプレーンオブジェクトにする（セーブデータにそのまま入るため）。

## 進め方
- `SPEC.md`「9. 実装フェーズ」を **1フェーズずつ** 実装する。
- フェーズ完了時：`npm test` と `npm run typecheck` を通す → コミット（必要ならプッシュ） → **そこで止まり、ユーザーに報告して次の指示を待つ**。次のフェーズへ勝手に進まない。

## コマンド
- `npm test` … Vitest（`src/**/*.test.ts`）
- `npm run typecheck` … 型チェック
- `npm run dev` / `npm run build` … 開発サーバー / ビルド
- `npm run players -- [seed] [人数]` … 選手を生成して能力表をコンソール出力
- `npm run game -- [seed] [平均総合力]` … 2チームで1試合を実行し、ログ・スコアボード・成績を出力
- `npm run balance -- [試合数] [seed] [平均総合力]` … バランス検証（目標値との比較）。config の係数を変えたら必ず実行する
- `npm run verify:steals -- [試合数] [seed]` … 盗塁の検証（積極度・能力帯ごとの企図数・成功率）
- `npm run verify:errors -- [試合数] [seed]` … エラーの検証（捕球・送球をそろえたチームの能力帯・守備位置ごとのエラー数）

## ディレクトリ
- `src/core/` … ゲームロジック（config, rng, types, names, pitches, overall, generate, format, team）
- `src/core/game/` … 試合エンジン（types, plan＝作戦AI・検証, plate＝打席抽選, runnerTable＝走者処理表, runners, engine, stats, format, balance＝バランス検証の集計, planEdit＝作戦の編集操作, fielding＝エラー判定, steal＝盗塁, replay＝試合画面の再生）
- `scripts/` … Node で実行する確認用スクリプト（tsx）
- `src/App.tsx`, `src/main.tsx`, `src/styles.css` … React UI のエントリ
- `src/ui/` … 画面コンポーネント（StrategyEditor＝作戦設定、GameScreen＝試合画面 など）
