/** バランス検証：同程度のチーム同士で多数の試合を行い、1チーム1試合あたりの指標を集計する */
import { BALANCE_TARGETS } from '../config';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import type { Player } from '../types';
import { simulateGame } from './engine';
import { buildAutoPlan } from './plan';
import { computeBoxScore } from './stats';
import { POSITIONS, type GamePlan, type GameResult, type Position, type StealPolicy, type TeamEntry } from './types';

export type BalanceMetric = keyof typeof BALANCE_TARGETS;

export interface StealSummary {
  attempts: number;
  successes: number;
  /** 見込み成功率の平均（企図した場面） */
  expectedSum: number;
}

export interface BalanceReport {
  games: number;
  metrics: Record<BalanceMetric, number>;
  /** 参考指標 */
  extra: {
    pa: number;
    hits: number;
    doubles: number;
    triples: number;
    obp: number;
    slg: number;
    doublePlays: number;
    sacFlies: number;
    drawRate: number;
    walkOffRate: number;
    homeWinRate: number;
    starterOuts: number;
    pitchersUsed: number;
    groundBallRate: number;
    lineDriveRate: number;
    flyBallRate: number;
    /** 1チーム1試合あたりの盗塁企図・成功・失策 */
    stealAttempts: number;
    stolenBases: number;
    errors: number;
  };
  /** 積極度ごとの盗塁 */
  stealsByPolicy: Record<StealPolicy, StealSummary>;
  /** 走者の盗塁能力の帯ごとの盗塁（"1-29" など） */
  stealsByAbility: Record<string, StealSummary>;
  /** 盗塁の種類ごと */
  stealsByBase: Record<'2' | '3' | '4', StealSummary>;
  /** 守備位置ごとのエラー（1チーム1試合あたり） */
  errorsByPosition: Record<Position, number>;
  /** 動作ごとのエラー（1チーム1試合あたり） */
  errorsByAction: Record<'field' | 'throw' | 'receive', number>;
}

export const STEAL_ABILITY_BANDS: readonly { label: string; min: number; max: number }[] = [
  { label: '1-29', min: 1, max: 29 },
  { label: '30-49', min: 30, max: 49 },
  { label: '50-69', min: 50, max: 69 },
  { label: '70-100', min: 70, max: 1000 },
];

const emptySteal = (): StealSummary => ({ attempts: 0, successes: 0, expectedSum: 0 });

export function aggregate(games: readonly GameResult[]): BalanceReport {
  let teams = 0, runs = 0, pa = 0, ab = 0, h = 0, d2 = 0, d3 = 0, hr = 0, k = 0, bb = 0, sf = 0, dp = 0;
  let pitches = 0, draws = 0, walkOffs = 0, homeWins = 0, starterOuts = 0, pitchersUsed = 0;
  let gb = 0, ld = 0, fb = 0, stealAttempts = 0, stolenBases = 0, errors = 0;
  const stealsByPolicy: Record<StealPolicy, StealSummary> = { none: emptySteal(), normal: emptySteal(), aggressive: emptySteal() };
  const stealsByAbility: Record<string, StealSummary> = Object.fromEntries(STEAL_ABILITY_BANDS.map((b) => [b.label, emptySteal()]));
  const stealsByBase: Record<'2' | '3' | '4', StealSummary> = { 2: emptySteal(), 3: emptySteal(), 4: emptySteal() };
  const errorsByPosition = Object.fromEntries(POSITIONS.map((p) => [p, 0])) as Record<Position, number>;
  const errorsByAction = { field: 0, throw: 0, receive: 0 };
  const add = (s: StealSummary, success: boolean, expected: number) => {
    s.attempts++;
    if (success) s.successes++;
    s.expectedSum += expected;
  };

  for (const g of games) {
    if (g.winner === 'draw') draws++;
    if (g.winner === 'home') homeWins++;
    if (g.walkOff) walkOffs++;
    const box = computeBoxScore(g);
    const players = new Map<string, Player>([...g.away.players, ...g.home.players].map((p) => [p.id, p]));
    for (const side of ['away', 'home'] as const) {
      teams++;
      runs += g.score[side];
      pitches += box[side].pitching.reduce((s, p) => s + p.pitches, 0);
      starterOuts += box[side].pitching[0]?.outs ?? 0;
      pitchersUsed += box[side].pitching.length;
      errors += box[side].errors;
    }
    for (const ev of g.events) {
      if (ev.type === 'stage') continue;
      const evErrors = ev.type === 'pa' ? ev.pa.errors : ev.steal.errors;
      for (const e of evErrors) {
        errorsByPosition[e.position]++;
        errorsByAction[e.action]++;
      }
      if (ev.type === 'steal') {
        const st = ev.steal;
        stealAttempts++;
        if (st.success) stolenBases++;
        add(stealsByPolicy[st.policy], st.success, st.expected);
        add(stealsByBase[String(st.to) as '2' | '3' | '4'], st.success, st.expected);
        const ability = players.get(st.runnerId)?.fielder.steal ?? 0;
        const band = STEAL_ABILITY_BANDS.find((b) => ability >= b.min && ability <= b.max);
        if (band) add(stealsByAbility[band.label]!, st.success, st.expected);
        continue;
      }
      const p = ev.pa;
      pa++;
      if (p.kind !== 'BB' && p.kind !== 'SF') ab++;
      if (p.kind === '1B' || p.kind === '2B' || p.kind === '3B' || p.kind === 'HR') h++;
      if (p.kind === '2B') d2++;
      if (p.kind === '3B') d3++;
      if (p.kind === 'HR') hr++;
      if (p.kind === 'K') k++;
      if (p.kind === 'BB') bb++;
      if (p.kind === 'SF') sf++;
      if (p.kind === 'DP') dp++;
      if (p.battedType === 'groundBall') gb++;
      if (p.battedType === 'lineDrive') ld++;
      if (p.battedType === 'flyBall') fb++;
    }
  }
  const tb = h + d2 + 2 * d3 + 3 * hr;
  const bip = gb + ld + fb;
  for (const pos of POSITIONS) errorsByPosition[pos] /= teams;
  for (const a of ['field', 'throw', 'receive'] as const) errorsByAction[a] /= teams;
  return {
    games: games.length,
    metrics: {
      runs: runs / teams,
      avg: h / ab,
      homeRuns: hr / teams,
      strikeoutRate: k / pa,
      walkRate: bb / pa,
      pitches: pitches / teams,
    },
    extra: {
      pa: pa / teams,
      hits: h / teams,
      doubles: d2 / teams,
      triples: d3 / teams,
      obp: (h + bb) / (ab + bb + sf),
      slg: tb / ab,
      doublePlays: dp / teams,
      sacFlies: sf / teams,
      drawRate: draws / games.length,
      walkOffRate: walkOffs / games.length,
      homeWinRate: homeWins / games.length,
      starterOuts: starterOuts / teams,
      pitchersUsed: pitchersUsed / teams,
      groundBallRate: gb / bip,
      lineDriveRate: ld / bip,
      flyBallRate: fb / bip,
      stealAttempts: stealAttempts / teams,
      stolenBases: stolenBases / teams,
      errors: errors / teams,
    },
    stealsByPolicy,
    stealsByAbility,
    stealsByBase,
    errorsByPosition,
    errorsByAction,
  };
}

export interface BalanceOptions {
  /** ロースター生成後に選手を加工する（エラー検証で捕球・送球をそろえる など） */
  modifyRoster?: (players: Player[], rng: Rng) => Player[];
  /** 作戦を加工する（盗塁の積極度の設定、守備位置の入れ替え など） */
  modifyPlan?: (plan: GamePlan, players: Player[]) => GamePlan;
}

/** 平均総合力 target のチーム同士で count 試合を行う（先攻・後攻はランダム） */
export function runBalanceGames(seed: number, count: number, target: number, options: BalanceOptions = {}): GameResult[] {
  const rng = new Rng(seed);
  const team = (name: string): TeamEntry => {
    let players = generateOpponentRoster(rng, target);
    if (options.modifyRoster) players = options.modifyRoster(players, rng);
    let plan = buildAutoPlan(players);
    if (options.modifyPlan) plan = options.modifyPlan(plan, players);
    return { name, players, plan };
  };
  const games: GameResult[] = [];
  for (let i = 0; i < count; i++) {
    const a = team('A');
    const b = team('B');
    const [away, home] = rng.next() < 0.5 ? [a, b] : [b, a];
    games.push(simulateGame(away, home, rng.int(0, 0x7fffffff)));
  }
  return games;
}

export function isWithinTarget(metric: BalanceMetric, value: number): boolean {
  const t = BALANCE_TARGETS[metric];
  return value >= t.min && value <= t.max;
}

export const successRate = (s: StealSummary) => (s.attempts > 0 ? s.successes / s.attempts : NaN);
