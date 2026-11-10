/** バランス検証：同程度のチーム同士で多数の試合を行い、1チーム1試合あたりの指標を集計する */
import { BALANCE_TARGETS } from '../config';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import { simulateGame } from './engine';
import { buildAutoPlan } from './plan';
import { computeBoxScore } from './stats';
import type { GameResult, TeamEntry } from './types';

export type BalanceMetric = keyof typeof BALANCE_TARGETS;

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
  };
}

export function aggregate(games: readonly GameResult[]): BalanceReport {
  let teams = 0, runs = 0, pa = 0, ab = 0, h = 0, d2 = 0, d3 = 0, hr = 0, k = 0, bb = 0, sf = 0, dp = 0;
  let pitches = 0, draws = 0, walkOffs = 0, homeWins = 0, starterOuts = 0, pitchersUsed = 0;
  let gb = 0, ld = 0, fb = 0;
  for (const g of games) {
    if (g.winner === 'draw') draws++;
    if (g.winner === 'home') homeWins++;
    if (g.walkOff) walkOffs++;
    const box = computeBoxScore(g);
    for (const side of ['away', 'home'] as const) {
      teams++;
      runs += g.score[side];
      pitches += box[side].pitching.reduce((s, p) => s + p.pitches, 0);
      starterOuts += box[side].pitching[0]?.outs ?? 0;
      pitchersUsed += box[side].pitching.length;
    }
    for (const ev of g.events) {
      if (ev.type !== 'pa') continue;
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
    },
  };
}

/** 平均総合力 target のチーム同士で count 試合を行う（先攻・後攻はランダム） */
export function runBalanceGames(seed: number, count: number, target: number): GameResult[] {
  const rng = new Rng(seed);
  const team = (name: string): TeamEntry => {
    const players = generateOpponentRoster(rng, target);
    return { name, players, plan: buildAutoPlan(players) };
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
