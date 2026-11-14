/**
 * 球数上限超過後の能力低下の検証（仕様変更4）。
 * チームAの投手の球数（スタミナ）や人数だけを変え、同じ相手・同じ試合のシードで対戦させて、
 * 旧曲線（1球1%・下限40%）と新曲線（超過10球までは1球0.5%、それ以降は2乗で加速・下限30%）でAの失点を比べる。
 *   npm run verify:fatigue               # 各2000試合
 *   npm run verify:fatigue -- 4000 3     # 試合数・シード
 */
import {
  buildAutoPlan,
  computeBoxScore,
  FATIGUE,
  generateOpponentRoster,
  playersOnField,
  Rng,
  simulateGame,
  type Player,
  type TeamEntry,
} from '../src/core';

const count = Number(process.argv[2] ?? 2000);
const seed = Number(process.argv[3] ?? 1);
const average = Number(process.argv[4] ?? 500);

const NEW_CURVE = { ...FATIGUE };
const OLD_CURVE = { knee: Infinity, perPitchOver: 0.01, quadratic: 0, minMultiplier: 0.4 };

interface Pair {
  a: Player[];
  b: Player[];
  aAway: boolean;
  gameSeed: number;
}

const rng = new Rng(seed);
const pairs: Pair[] = Array.from({ length: count }, () => ({
  a: generateOpponentRoster(rng, average),
  b: generateOpponentRoster(rng, average),
  aAway: rng.next() < 0.5,
  gameSeed: rng.int(0, 0x7fffffff),
}));

interface Condition {
  label: string;
  /** Aの選手を変える（球数・人数） */
  team: (players: Player[]) => Player[];
}

const withStamina = (stamina: number) => (players: Player[]) => players.map((p) => ({ ...p, pitcher: { ...p.pitcher, stamina } }));
/** 先発の9人だけのチーム（継投なし） */
const nineOnly = (players: Player[]) => {
  const ids = new Set(playersOnField(buildAutoPlan(players).stages[0]!));
  return players.filter((p) => ids.has(p.id));
};

const conditions: Condition[] = [
  { label: '通常のチーム（12人・先発＋継投3）', team: (p) => p },
  { label: '全員の球数60（12人・先発＋継投3）', team: withStamina(60) },
  { label: '全員の球数40（12人・先発＋継投3）', team: withStamina(40) },
  { label: '全員の球数30（12人・先発＋継投3）', team: withStamina(30) },
  { label: '9人だけ（継投なし・球数はそのまま）', team: nineOnly },
  { label: '9人だけ・全員の球数100', team: (p) => withStamina(100)(nineOnly(p)) },
  { label: '9人だけ・全員の球数60', team: (p) => withStamina(60)(nineOnly(p)) },
];

function measure(cond: Condition, curve: typeof NEW_CURVE) {
  Object.assign(FATIGUE, curve);
  let allowed = 0;
  let over = 0;
  let overGames = 0;
  for (const p of pairs) {
    const a = cond.team(p.a);
    const A: TeamEntry = { name: 'A', players: a, plan: buildAutoPlan(a) };
    const B: TeamEntry = { name: 'B', players: p.b, plan: buildAutoPlan(p.b) };
    const g = simulateGame(p.aAway ? A : B, p.aAway ? B : A, p.gameSeed);
    const aSide = p.aAway ? 'away' : 'home';
    const bSide = p.aAway ? 'home' : 'away';
    allowed += g.score[bSide];
    const stamina = new Map(a.map((pl) => [pl.id, pl.pitcher.stamina]));
    const o = computeBoxScore(g)[aSide].pitching.reduce((s, l) => s + Math.max(0, l.pitches - stamina.get(l.playerId)!), 0);
    over += o;
    if (o > 0) overGames++;
  }
  Object.assign(FATIGUE, NEW_CURVE);
  return { allowed: allowed / count, over: over / count, overRate: overGames / count };
}

console.log(`チームAの投手の球数・人数を変えて、Aの失点を旧曲線と新曲線で比べる（平均総合力${average}同士、同じ${count}試合 / seed ${seed}）`);
console.log('超過球数は「球数上限を超えて投げた球数」の1試合平均（超過あり＝超過が1球以上あった試合の割合）\n');
console.log('超過球数  超過あり  旧の失点  新の失点     差   条件');
for (const cond of conditions) {
  const before = measure(cond, OLD_CURVE);
  const after = measure(cond, NEW_CURVE);
  const diff = after.allowed - before.allowed;
  console.log(
    `${after.over.toFixed(1).padStart(8)}  ${(after.overRate * 100).toFixed(0).padStart(7)}%  ${before.allowed.toFixed(2).padStart(8)}  ${after.allowed.toFixed(2).padStart(8)}  ${(diff >= 0 ? '+' : '') + diff.toFixed(2)}   ${cond.label}`,
  );
}
