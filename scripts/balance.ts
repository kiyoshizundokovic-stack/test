/**
 * バランス検証スクリプト（SPEC 9 フェーズ3）。
 * 同程度の能力のチーム同士で多数の試合を行い、1チーム1試合あたりの指標を目標値と比較する。
 *   npm run balance                    # 1000試合・シード1・平均総合力400
 *   npm run balance -- 1000 7 600      # 試合数・シード・平均総合力
 */
import { aggregate, BALANCE_TARGETS, isWithinTarget, runBalanceGames, type BalanceMetric } from '../src/core';

const count = Number(process.argv[2] ?? 1000);
const seed = Number(process.argv[3] ?? 1);
const target = Number(process.argv[4] ?? 400);

const report = aggregate(runBalanceGames(seed, count, target));

const fmt = (m: BalanceMetric, v: number) =>
  m === 'avg' ? v.toFixed(3).replace(/^0/, '') : m.endsWith('Rate') ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
const LABELS: Record<BalanceMetric, string> = {
  runs: '得点', avg: '打率', homeRuns: '本塁打', strikeoutRate: '三振率', walkRate: '四球率', pitches: '球数',
};

console.log(`${count}試合 / seed ${seed} / 平均総合力 ${target}（1チーム1試合あたり）\n`);
let ok = 0;
for (const m of Object.keys(BALANCE_TARGETS) as BalanceMetric[]) {
  const v = report.metrics[m];
  const t = BALANCE_TARGETS[m];
  const pass = isWithinTarget(m, v);
  if (pass) ok++;
  console.log(`${pass ? 'OK' : 'NG'}  ${LABELS[m].padEnd(4, '　')} ${fmt(m, v).padStart(7)}   目標 ${fmt(m, t.min)}〜${fmt(m, t.max)}`);
}
const e = report.extra;
console.log(`\n${ok}/${Object.keys(BALANCE_TARGETS).length} 項目が目標内\n`);
console.log('参考:');
console.log(`  打席 ${e.pa.toFixed(1)} / 安打 ${e.hits.toFixed(2)}（二塁打 ${e.doubles.toFixed(2)}・三塁打 ${e.triples.toFixed(2)}）`);
console.log(`  出塁率 ${e.obp.toFixed(3)} / 長打率 ${e.slg.toFixed(3)} / 併殺 ${e.doublePlays.toFixed(2)} / 犠飛 ${e.sacFlies.toFixed(2)}`);
console.log(`  打球 ゴロ ${(e.groundBallRate * 100).toFixed(1)}% ライナー ${(e.lineDriveRate * 100).toFixed(1)}% フライ ${(e.flyBallRate * 100).toFixed(1)}%`);
console.log(`  先発の平均投球回 ${(e.starterOuts / 3).toFixed(2)} / 登板投手数 ${e.pitchersUsed.toFixed(2)}`);
console.log(`  引き分け率 ${(e.drawRate * 100).toFixed(1)}% / サヨナラ率 ${(e.walkOffRate * 100).toFixed(1)}% / 後攻勝率 ${(e.homeWinRate * 100).toFixed(1)}%`);
