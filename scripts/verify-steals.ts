/**
 * 盗塁の検証（仕様変更1）。積極度ごとに企図数・成功率を集計する。
 *   npm run verify:steals                 # 各500試合、平均総合力 500 / 750 / 950
 *   npm run verify:steals -- 1000 3       # 試合数・シード
 * 条件
 *   A. 全員「通常」（相手チームと同じ）
 *   B. 各チームの盗塁能力の上位3人を「積極盗塁」、他は「通常」
 */
import { runBalanceGames, aggregate, setStealPolicy, successRate, type BalanceReport, type StealSummary } from '../src/core';

const count = Number(process.argv[2] ?? 500);
const seed = Number(process.argv[3] ?? 1);

const pct = (s: StealSummary) => (s.attempts ? `${(successRate(s) * 100).toFixed(1)}%` : '   -  ');
const line = (label: string, s: StealSummary, games: number) =>
  `  ${label.padEnd(12)} 企図 ${String(s.attempts).padStart(5)}（1チーム1試合 ${(s.attempts / (games * 2)).toFixed(2)}）  成功率 ${pct(s).padStart(6)}  見込みの平均 ${s.attempts ? ((s.expectedSum / s.attempts) * 100).toFixed(1) + '%' : '-'}`;

function report(title: string, r: BalanceReport) {
  console.log(`■ ${title}`);
  console.log(line('通常', r.stealsByPolicy.normal, r.games));
  console.log(line('積極盗塁', r.stealsByPolicy.aggressive, r.games));
  const all: StealSummary = {
    attempts: r.stealsByPolicy.normal.attempts + r.stealsByPolicy.aggressive.attempts,
    successes: r.stealsByPolicy.normal.successes + r.stealsByPolicy.aggressive.successes,
    expectedSum: r.stealsByPolicy.normal.expectedSum + r.stealsByPolicy.aggressive.expectedSum,
  };
  console.log(line('全体', all, r.games));
  console.log('  盗塁能力の帯ごと:');
  for (const [band, s] of Object.entries(r.stealsByAbility)) console.log(`  ${line(band, s, r.games)}`);
  console.log('  種類ごと:');
  for (const [base, s] of Object.entries(r.stealsByBase)) console.log(`  ${line(base === '2' ? '二盗' : base === '3' ? '三盗' : '本盗', s, r.games)}`);
  console.log(`  得点 ${r.metrics.runs.toFixed(2)}\n`);
}

for (const target of [500, 750, 950]) {
  console.log(`===== 平均総合力 ${target}（${count}試合 / seed ${seed}）=====`);
  report('A. 全員「通常」', aggregate(runBalanceGames(seed, count, target)));
  report(
    'B. 盗塁能力の上位3人を「積極盗塁」',
    aggregate(
      runBalanceGames(seed, count, target, {
        modifyPlan: (plan, players) =>
          [...players]
            .sort((a, b) => b.fielder.steal - a.fielder.steal)
            .slice(0, 3)
            .reduce((p, pl) => setStealPolicy(p, pl.id, 'aggressive'), plan),
      }),
    ),
  );
}
