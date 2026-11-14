/**
 * 難易度のバランス検証レポートを作る（分析専用。ゲームの仕様は変えない）。
 *   npm run balance-report                 # 既定の試行回数で docs/balance-report.md を書き出す
 *   npm run balance-report -- quick        # 試行回数を1/5にした確認用
 * 項目：1 指摘の前提 / 2 作戦の効果 / 3 戦力差と勝率 / 4 先発投手の影響 / 5 ローグライク全体 / 6 調整案の比較
 */
import { writeFileSync } from 'node:fs';
import {
  DEFAULT_RULES,
  POLICY_LABELS,
  runMatchup,
  simulateMany,
  summarize,
  type Bot,
  type MatchupResult,
  type RunRules,
  type RunStats,
  type SideSpec,
} from '../src/core/analysis';

const quick = process.argv[2] === 'quick';
const scale = quick ? 0.2 : 1;
const GAMES = Math.round(2000 * scale);
const RUNS = Math.round(1000 * scale);
const out: string[] = [];
const log = (s = '') => {
  out.push(s);
  console.log(s);
};
const t0 = Date.now();
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const ci = (r: MatchupResult) => `±${(r.stderr * 196).toFixed(1)}`;
const side = (plan: SideSpec['plan'], target = 500, roster: SideSpec['roster'] = 'opponent', size = 12): SideSpec => ({ plan, roster, target, size });
const matchRow = (label: string, r: MatchupResult) =>
  `| ${label} | ${r.games} | ${pct(r.winRate)} ${ci(r)} | ${r.wins}-${r.losses}-${r.draws} | ${r.runsFor.toFixed(2)} - ${r.runsAgainst.toFixed(2)} |`;
const MATCH_HEAD = ['| 対戦 | 試合数 | 勝率（引分除く・95%区間） | 勝-敗-分 | 平均得点-失点 |', '|---|---|---|---|---|'];
const runHead = ['| 条件 | 完走率 | 到達試合数 中央値（10/25/75/90%点） | 30戦以上 | 50戦以上 | 購入ライフ（平均） | 獲得選手（平均） | 勝率 |', '|---|---|---|---|---|---|---|---|'];
const runRow = (label: string, s: RunStats) =>
  `| ${label} | ${pct(s.finishRate)} | ${s.percentiles.p50}（${s.percentiles.p10}/${s.percentiles.p25}/${s.percentiles.p75}/${s.percentiles.p90}） | ${pct(s.reachedAtLeast[30]!)} | ${pct(s.reachedAtLeast[50]!)} | ${s.livesBoughtMean.toFixed(2)} | ${s.acquiredMean.toFixed(2)} | ${pct(s.winRate)} |`;

log('# 難易度バランス検証レポート');
log();
log(`- 生成: \`npm run balance-report\`（試合の勝率は各${GAMES}試合、ローグライクは各${RUNS}ラン）`);
log('- ゲームの仕様・数値は変更していない。検証用のボット・シミュレーターは `src/core/analysis/`（分析専用）');
log('- 特記のない限り、プレイヤー側の初期選手は**12人**（ユーザー指定）。相手は現仕様どおり12人・先発スタミナ100以上');
log('- 勝率は引き分けを除いた値（勝÷(勝+敗)）。95%区間は ±1.96×標準誤差');
log();

// ---------------------------------------------------------------------------
log('## 1. 指摘の前提（フェーズ6で「難しすぎる」と判断した条件）');
log();
log('フェーズ6の報告は次の条件のシミュレーションに基づく。');
log();
log('- **プレイヤー側の作戦**：相手と同じ作戦AI（`buildAutoPlan`）。初期選手は仕様どおり**9人**（継投なし）');
log('- **補強の方針**：勝利後、ライフが1以下でポイントが1000以上ならライフを1つ購入。相手の最強選手が自チームの最弱選手より総合力が高く、買えるなら獲得（枠が埋まっていれば最弱を売却してから）。ボス報酬は総合力の最も高い選手');
log('- **試行回数**：300ラン（`npm run run-sim -- 300 1`）。結果は完走0%、到達試合数の中央値5戦、20戦以上0%');
log('- 追加で各200ランの比較（初期12人、勝利ポイント×5・×10）も行い、いずれも完走0%');
log();
log('同じ条件を、このレポートのシミュレーター（run.ts と同じ乱数の使い方で、結果が一致することをテストで確認済み）で再測定した結果：');
log();
const premise9 = simulateMany(RUNS, 1, { plan: 'ai', reinforce: 'playerFirst' }, { ...DEFAULT_RULES, initialRosterSize: 9 });
const premise12 = simulateMany(RUNS, 1, { plan: 'ai', reinforce: 'playerFirst' }, { ...DEFAULT_RULES, initialRosterSize: 12 });
runHead.forEach((l) => log(l));
log(runRow('作戦AI・選手優先・初期9人（フェーズ6の条件）', premise9));
log(runRow('作戦AI・選手優先・初期12人', premise12));
log();
log('この前提には、(a) プレイヤーの作戦が相手と同じAIで「上手なプレイヤー」を想定していない、(b) 初期9人は継投できず相手（12人・控え投手3人）と条件が違う、という偏りがあった。以下ではこれを切り分ける。');
log();

// ---------------------------------------------------------------------------
log('## 2. 作戦の効果（総合力が同じチーム同士、平均総合力500）');
log();
log('両チームとも相手と同じ生成方法（12人・先発スタミナ100以上）にして、作戦の差だけを比べる。');
log();
log('- **最適化した作戦**（`optimizedPlan`）：投手陣（先発＋控え全員）を投手能力の上位候補の組み合わせから選び、残り8人の守備位置を試合エンジンの式に基づく守備の価値で最適に割り当て（全探索と一致することをテスト済み）、打順は打撃上位5人のうち出塁型を1番・長打型を4番、継投は質の高い順');
log('- **ランダムな打順・守備配置**（`randomPlan`）：敵AIと同じ9人・継投で、打順と野手8人の守備位置をランダムにしたもの');
log();
const m = {
  aiAi: runMatchup(11, GAMES, side('ai'), side('ai')),
  optAi: runMatchup(12, GAMES, side('optimized'), side('ai')),
  optRnd: runMatchup(13, GAMES, side('optimized'), side('random')),
  rndAi: runMatchup(14, GAMES, side('random'), side('ai')),
  aiRnd: runMatchup(15, GAMES, side('ai'), side('random')),
};
MATCH_HEAD.forEach((l) => log(l));
log(matchRow('敵AI vs 敵AI', m.aiAi));
log(matchRow('**最適化** vs 敵AI', m.optAi));
log(matchRow('**最適化** vs ランダム配置', m.optRnd));
log(matchRow('（参考）ランダム配置 vs 敵AI', m.rndAi));
log(matchRow('（参考）敵AI vs ランダム配置', m.aiRnd));
log();
log(
  `**結論**：作戦の上手下手による勝率の差は小さい（最適化 vs 敵AI ${pct(m.optAi.winRate)}、最適化 vs ランダム ${pct(m.optRnd.winRate)}）。` +
    '試合エンジンでは守備位置ごとの能力差がアウト率に与える影響が小さく（係数0.2〜0.3×能力差）、打順も1試合の打席数を少し入れ替えるだけのため。' +
    '作戦を工夫しても戦力差（下記3）を埋めることはほぼできない。',
);
log();

// ---------------------------------------------------------------------------
log('## 3. 戦力差と勝率');
log();
log('プレイヤー側の平均総合力を相手（500または800）より高くしたときの勝率。両チームとも相手と同じ生成方法・12人。');
log();
log('| 平均総合力の差 | 基準500：敵AI同士 | 基準500：最適化 vs 敵AI | 基準800：最適化 vs 敵AI |');
log('|---|---|---|---|');
const diffs = [0, 50, 100, 200];
const diffResults: Record<number, MatchupResult> = {};
for (const d of diffs) {
  const a = runMatchup(20 + d, GAMES, side('ai', 500 + d), side('ai', 500));
  const o = runMatchup(30 + d, GAMES, side('optimized', 500 + d), side('ai', 500));
  const h = runMatchup(40 + d, GAMES, side('optimized', 800 + d), side('ai', 800));
  diffResults[d] = o;
  log(`| +${d} | ${pct(a.winRate)} ${ci(a)} | ${pct(o.winRate)} ${ci(o)} | ${pct(h.winRate)} ${ci(h)} |`);
}
log();
log('ローグライクでは相手が10戦ごとに+50（ボスは+150）強くなるので、自チームもそれ以上のペースで強化しないと勝率が下がっていく。');
log();

// ---------------------------------------------------------------------------
log('## 4. 先発投手の影響');
log();
log('プレイヤー側のロースターを初期選手と同じ生成方法（**先発スタミナの保証なし**）にした場合と、相手と同じ（**先発スタミナ100以上を保証**）にした場合の比較。どちらも最適化した作戦、相手は敵AI、平均総合力500同士、12人。');
log();
const guaranteed = runMatchup(51, GAMES * 2, side('optimized', 500, 'opponent'), side('ai'));
const unguaranteed = runMatchup(52, GAMES * 2, side('optimized', 500, 'player'), side('ai'));
MATCH_HEAD.forEach((l) => log(l));
log(matchRow('保証あり（相手と同じ） vs 敵AI', guaranteed));
log(matchRow('保証なし（初期選手と同じ） vs 敵AI', unguaranteed));
log();
log('保証なしのロースターを、プレイヤー側の先発のスタミナで分けた勝率：');
log();
log('| 先発のスタミナ | 試合数 | 勝率 | 平均失点 |');
log('|---|---|---|---|');
for (const [label, lo, hi] of [['60球未満', 0, 59], ['60〜99球', 60, 99], ['100球以上', 100, 999]] as const) {
  const sub = summarize(unguaranteed.records.filter((r) => r.starterStamina >= lo && r.starterStamina <= hi));
  log(`| ${label} | ${sub.games} | ${pct(sub.winRate)} ${ci(sub)} | ${sub.runsAgainst.toFixed(2)} |`);
}
const share100 = unguaranteed.records.filter((r) => r.maxStamina >= 100).length / unguaranteed.records.length;
log();
log(`保証なしの生成で、12人の中にスタミナ100以上の選手がいる割合：${pct(share100)}。`);
log();
log('初期選手9人（仕様どおり、継投なし）の場合：');
log();
const nine = runMatchup(53, GAMES, side('optimized', 500, 'player', 9), side('ai'));
const nineAi = runMatchup(54, GAMES, side('ai', 500, 'player', 9), side('ai'));
MATCH_HEAD.forEach((l) => log(l));
log(matchRow('9人・最適化 vs 敵AI（12人）', nine));
log(matchRow('9人・敵AIと同じ作戦 vs 敵AI（12人）', nineAi));
log();

// ---------------------------------------------------------------------------
log('## 5. ローグライク全体のシミュレーション（現仕様の数値、初期12人）');
log();
log('最適化した作戦（ロースターが変わるたびに作り直す）＋補強方針のボット。ボス報酬は総合力の最も高い選手。');
log();
log('- **ライフ優先**：ポイントはすべてライフに使う（1000たまるたびに購入。選手は獲得しない）');
log('- **選手優先**：ライフが1のときだけ1つ買い、あとは相手の最強選手を獲得（枠が埋まっていれば最弱より強い場合に入れ替え）');
log('- **バランス**：ライフが3になるまで買い、総合力が50以上上がる入れ替えだけ行う');
log();
const policies: Bot['reinforce'][] = ['lifeFirst', 'playerFirst', 'balanced'];
const policyStats: Record<string, RunStats> = {};
runHead.forEach((l) => log(l));
for (const p of policies) {
  const s = simulateMany(RUNS, 1000, { plan: 'optimized', reinforce: p }, { ...DEFAULT_RULES, initialRosterSize: 12 });
  policyStats[p] = s;
  log(runRow(`最適化・${POLICY_LABELS[p]}`, s));
}
const noReinforce = simulateMany(RUNS, 1000, { plan: 'optimized', reinforce: 'none' }, { ...DEFAULT_RULES, initialRosterSize: 12 });
log(runRow('最適化・補強しない', noReinforce));
log();
const bestPolicy = policies.reduce((a, b) => (policyStats[b]!.reachedMean > policyStats[a]!.reachedMean ? b : a));
log(`到達試合数の平均が最も長い方針：**${POLICY_LABELS[bestPolicy]}**（平均 ${policyStats[bestPolicy]!.reachedMean.toFixed(1)}戦）。以下の調整案はこの方針で比較する。`);
log();
log('到達試合数の分布（10戦ごと、最適化・' + POLICY_LABELS[bestPolicy] + '）：');
log();
{
  const s = policyStats[bestPolicy]!;
  log('| 到達試合数 | 10戦以上 | 20戦以上 | 30戦以上 | 50戦以上 | 70戦以上 | 100戦（完走） |');
  log('|---|---|---|---|---|---|---|');
  log(`| 割合 | ${[10, 20, 30, 50, 70, 100].map((n) => pct(s.reachedAtLeast[n]!)).join(' | ')} |`);
}
log();

// ---------------------------------------------------------------------------
log('## 6. 難易度の調整案と効果');
log();
log(`いずれも初期12人・最適化した作戦・${POLICY_LABELS[bestPolicy]}方針、各${RUNS}ラン。「基準」は現仕様の数値（初期選手のみ12人）。`);
log();
const base: RunRules = { ...DEFAULT_RULES, initialRosterSize: 12 };
const bot: Bot = { plan: 'optimized', reinforce: bestPolicy };
const variants: [string, Partial<RunRules>][] = [
  ['基準（現仕様・初期12人）', {}],
  ['（参考）初期9人＝現仕様そのまま', { initialRosterSize: 9 }],
  ['初期ライフ5', { initialLife: 5 }],
  ['初期ライフ10', { initialLife: 10 }],
  ['ライフ価格500', { lifePrice: 500 }],
  ['ライフ価格250', { lifePrice: 250 }],
  ['勝利ポイント×3（相手平均の3/10）', { winPointRatio: 0.3 }],
  ['勝利ポイント×5（相手平均の1/2）', { winPointRatio: 0.5 }],
  ['ボス戦勝利でライフ+1', { lifeOnBossWin: 1 }],
  ['敵の初期強さ450（ボス600）', { normalBase: 450, bossBase: 600 }],
  ['敵の上昇幅+25（10戦ごと）', { step: 25 }],
  ['敵の上昇幅0（強さ一定）', { step: 0 }],
  ['敵AIの作戦をランダム（打順・守備配置）', { enemyPlan: 'random' }],
  ['組合せA：ライフ価格500＋勝利ポイント×3', { lifePrice: 500, winPointRatio: 0.3 }],
  ['組合せB：初期ライフ5＋上昇幅+25＋ボス勝利でライフ+1', { initialLife: 5, step: 25, lifeOnBossWin: 1 }],
  ['組合せC：勝利ポイント×3＋上昇幅+25＋ボス勝利でライフ+1', { winPointRatio: 0.3, step: 25, lifeOnBossWin: 1 }],
  ['組合せD：初期ライフ5＋ライフ価格500＋勝利ポイント×3＋上昇幅+25', { initialLife: 5, lifePrice: 500, winPointRatio: 0.3, step: 25 }],
];
runHead.forEach((l) => log(l));
for (const [label, v] of variants) {
  const s = simulateMany(RUNS, 2000, bot, { ...base, ...v });
  log(runRow(label, s));
}
log();
log(`（所要時間 ${((Date.now() - t0) / 1000).toFixed(0)}秒）`);

if (!quick) writeFileSync(new URL('../docs/balance-report.md', import.meta.url), out.join('\n') + '\n');
