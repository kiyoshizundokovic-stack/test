/** 対戦の勝率測定（バランス検証用。分析専用） */
import { simulateGame } from '../game/engine';
import { buildAutoPlan } from '../game/plan';
import type { GamePlan, TeamEntry } from '../game/types';
import { generatePlayers } from '../generate';
import { calcOverall } from '../overall';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import type { Player } from '../types';
import { optimizedPlan, randomPlan } from './strategy';

export type PlanKind = 'ai' | 'optimized' | 'random';
/** ロースターの作り方：opponent＝相手と同じ（先発スタミナ100以上を保証）、player＝初期選手と同じ（保証なし） */
export type RosterKind = 'opponent' | 'player';

export function makePlan(kind: PlanKind, players: readonly Player[], rng: Rng): GamePlan {
  if (kind === 'optimized') return optimizedPlan(players);
  if (kind === 'random') return randomPlan(players, rng);
  return buildAutoPlan(players);
}

export function makeRoster(kind: RosterKind, rng: Rng, target: number, size: number): Player[] {
  return kind === 'opponent' ? generateOpponentRoster(rng, target, size) : generatePlayers(rng, size, { targetOverall: target });
}

export interface SideSpec {
  plan: PlanKind;
  roster: RosterKind;
  target: number;
  size: number;
}

export interface GameRecord {
  outcome: 'win' | 'loss' | 'draw';
  runsFor: number;
  runsAgainst: number;
  /** プレイヤー側の最大スタミナ・先発のスタミナ・平均総合力 */
  maxStamina: number;
  starterStamina: number;
  avgOverall: number;
  enemyAvgOverall: number;
}

export interface MatchupResult {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** 勝率（引き分けを除く） */
  winRate: number;
  /** 勝ち点率（引き分けを0.5勝） */
  pointRate: number;
  /** 勝率の標準誤差（引き分けを除く） */
  stderr: number;
  runsFor: number;
  runsAgainst: number;
  records: GameRecord[];
}

/** プレイヤー側（mine）と敵（enemy）を count 試合対戦させる。チームは試合ごとに生成、先攻・後攻はランダム */
export function runMatchup(seed: number, count: number, mine: SideSpec, enemy: SideSpec): MatchupResult {
  const rng = new Rng(seed);
  const records: GameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const myPlayers = makeRoster(mine.roster, rng, mine.target, mine.size);
    const enemyPlayers = makeRoster(enemy.roster, rng, enemy.target, enemy.size);
    const planRng = new Rng(rng.int(0, 0x7fffffff));
    const myPlan = makePlan(mine.plan, myPlayers, planRng);
    const enemyPlan = makePlan(enemy.plan, enemyPlayers, planRng);
    const me: TeamEntry = { name: 'mine', players: myPlayers, plan: myPlan };
    const them: TeamEntry = { name: 'enemy', players: enemyPlayers, plan: enemyPlan };
    const side = rng.next() < 0.5 ? 'away' : 'home';
    const g = simulateGame(side === 'away' ? me : them, side === 'away' ? them : me, rng.int(0, 0x7fffffff));
    const other = side === 'away' ? 'home' : 'away';
    const starter = myPlayers.find((p) => p.id === myPlan.stages[0]!.positions.P)!;
    records.push({
      outcome: g.winner === 'draw' ? 'draw' : g.winner === side ? 'win' : 'loss',
      runsFor: g.score[side],
      runsAgainst: g.score[other],
      maxStamina: Math.max(...myPlayers.map((p) => p.pitcher.stamina)),
      starterStamina: starter.pitcher.stamina,
      avgOverall: myPlayers.reduce((s, p) => s + calcOverall(p), 0) / myPlayers.length,
      enemyAvgOverall: enemyPlayers.reduce((s, p) => s + calcOverall(p), 0) / enemyPlayers.length,
    });
  }
  return summarize(records);
}

export function summarize(records: GameRecord[]): MatchupResult {
  const wins = records.filter((r) => r.outcome === 'win').length;
  const losses = records.filter((r) => r.outcome === 'loss').length;
  const draws = records.length - wins - losses;
  const decided = wins + losses;
  const winRate = decided ? wins / decided : NaN;
  return {
    games: records.length,
    wins,
    losses,
    draws,
    winRate,
    pointRate: records.length ? (wins + draws / 2) / records.length : NaN,
    stderr: decided ? Math.sqrt((winRate * (1 - winRate)) / decided) : NaN,
    runsFor: records.reduce((s, r) => s + r.runsFor, 0) / Math.max(1, records.length),
    runsAgainst: records.reduce((s, r) => s + r.runsAgainst, 0) / Math.max(1, records.length),
    records,
  };
}
