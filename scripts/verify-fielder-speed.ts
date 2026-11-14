/**
 * 守備者の走力（守備範囲）の検証（仕様変更3）。
 * チームAの外野手（または内野手）の走力だけを変え、同じ相手・同じ試合のシードで対戦させて、Aの失点を比べる。
 * 失点（相手の得点）はAの打撃・走塁の影響を受けないので、守備の効果だけを見られる。
 *   npm run verify:fielder-speed               # 各2000試合
 *   npm run verify:fielder-speed -- 4000 3     # 試合数・シード
 */
import {
  buildAutoPlan,
  computeBoxScore,
  generateOpponentRoster,
  POSITION_LABELS,
  Rng,
  simulateGame,
  type Player,
  type Position,
  type TeamEntry,
} from '../src/core';

const count = Number(process.argv[2] ?? 2000);
const seed = Number(process.argv[3] ?? 1);

interface Pair {
  a: Player[];
  b: Player[];
  aAway: boolean;
  gameSeed: number;
}

// 同じ組み合わせ（ロースター・先攻後攻・試合のシード）を走力の条件ごとに使い回す
const rng = new Rng(seed);
const pairs: Pair[] = Array.from({ length: count }, () => ({
  a: generateOpponentRoster(rng, 500),
  b: generateOpponentRoster(rng, 500),
  aAway: rng.next() < 0.5,
  gameSeed: rng.int(0, 0x7fffffff),
}));

function measure(positions: readonly Position[], speed: number | null) {
  let allowed = 0;
  let hitsAllowed = 0;
  let errors = 0;
  for (const p of pairs) {
    const planA = buildAutoPlan(p.a);
    const ids = new Set(positions.map((pos) => planA.stages[0]!.positions[pos]));
    const a = speed === null ? p.a : p.a.map((pl) => (ids.has(pl.id) ? { ...pl, fielder: { ...pl.fielder, speed } } : pl));
    const A: TeamEntry = { name: 'A', players: a, plan: planA };
    const B: TeamEntry = { name: 'B', players: p.b, plan: buildAutoPlan(p.b) };
    const g = simulateGame(p.aAway ? A : B, p.aAway ? B : A, p.gameSeed);
    const bSide = p.aAway ? 'home' : 'away';
    const aSide = p.aAway ? 'away' : 'home';
    allowed += g.score[bSide];
    const box = computeBoxScore(g);
    hitsAllowed += box[bSide].hits;
    errors += box[aSide].fielding.filter((f) => ids.has(f.playerId)).reduce((s, f) => s + f.e, 0);
  }
  return { allowed: allowed / count, hits: hitsAllowed / count, errors: errors / count };
}

console.log(`チームAの守備位置の選手の走力だけを変える（平均総合力500同士、同じ${count}試合 / seed ${seed}）\n`);
for (const [label, positions] of [
  ['外野手（左翼・中堅・右翼）', ['LF', 'CF', 'RF']],
  ['内野手（一塁・二塁・三塁・遊撃）', ['1B', '2B', '3B', 'SS']],
] as [string, Position[]][]) {
  console.log(`■ ${label}の走力`);
  const base = measure(positions, null);
  console.log(`  そのまま : Aの失点 ${base.allowed.toFixed(2)} / 被安打 ${base.hits.toFixed(2)}`);
  for (const v of [20, 50, 80]) {
    const r = measure(positions, v);
    console.log(
      `  走力${v}　: Aの失点 ${r.allowed.toFixed(2)} / 被安打 ${r.hits.toFixed(2)} / ${positions.map((p) => POSITION_LABELS[p]).join('・')}の失策 ${r.errors.toFixed(2)}`,
    );
  }
  console.log('');
}
