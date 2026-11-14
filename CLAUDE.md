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
- **セーブデータの形式（RunState・ストック）を変えたら、`src/core/save/` のバージョンを上げてマイグレーションとテストを追加する**。

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
- `npm run run-sim -- [ラン数] [開始seed]` … ローグライク進行の通しシミュレーション（簡単な方針で自動プレイし、到達試合数・完走率を集計）
- `npm run balance-report [-- quick]` … 難易度のバランス検証一式（作戦の効果・戦力差・先発投手・ローグライク全体・調整案の比較）を実行し `docs/balance-report.md` に書き出す（数分かかる。quick は試行回数1/5で書き出さない）
- `npm run campaign-report [-- quick]` … 繰り返しプレイ（ストックを持ち越すボット）の難易度検証。初回プレイの到達試合数・初完走までのプレイ回数を条件ごとに測り `docs/campaign-report.md` に書き出す（4並列で十数分。quick は書き出さない）

## ディレクトリ
- `src/core/` … ゲームロジック（config, rng, types, names, pitches, overall, generate, format, team）
- `src/core/run/` … ローグライク進行（RunState、試合・補強・ボス報酬・再戦・終了判定、選手ID）
- `src/core/save/` … セーブデータの形式・検証・マイグレーション（React・ブラウザ非依存）
- `src/core/stock/` … ストック（選手の持ち越し・一覧の操作・並べ替え）と通算成績（試合ごとの集計・指標の定義 STAT_DEFINITIONS）
- `src/core/analysis/` … バランス検証専用（最適化した作戦ボット、ランダム配置、対戦の勝率測定、規則を差し替えられるローグライクのシミュレーター、ストックを持ち越す繰り返しプレイのシミュレーター）。ゲームの仕様ではない
- `src/core/game/` … 試合エンジン（types, plan＝作戦AI・検証, plate＝打席抽選, runnerTable＝走者処理表, runners, engine, stats, format, balance＝バランス検証の集計, planEdit＝作戦の編集操作, fielding＝エラー判定, steal＝盗塁, replay＝試合画面の再生）
- `scripts/` … Node で実行する確認用スクリプト（tsx）
- `docs/` … 検証レポート（balance-report.md、campaign-report.md）
- `src/App.tsx`, `src/main.tsx`, `src/styles.css` … React UI のエントリ（セーブデータの読み込み・自動保存）
- `src/storage/` … IndexedDB への保存（UI 層。core からは使わない）
- `src/ui/` … 画面コンポーネント（TitleScreen＝タイトル・データの入出力、PlayScreen＝進行中のプレイ、StockScreens＝ストック一覧・ニューゲームの選手選び・終了時の選択、StrategyEditor＝作戦設定、GameScreen＝試合画面、RunScreens＝ホーム・結果と補強・ボス報酬・終了、PlayerCard＝選手表示 など）
