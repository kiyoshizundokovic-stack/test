/**
 * 盗塁（SPEC 3.5）。打席結果の判定より前に、1打席につき1回まで行う。
 * 企図の判断に使う「見込み成功率」と実際の成否判定は、同じ関数 stealSuccessProbability で計算する。
 */
import {
  BASELINE,
  FIELDER_ABILITY_MAX,
  OUTS_PER_INNING,
  QUICK_MAX,
  STEAL,
  VELOCITY_BASE_KMH,
  VELOCITY_MAX_KMH,
} from '../config';
import type { Rng } from '../rng';
import type { Player } from '../types';
import { runFieldingChain, stealThrowSteps } from './fielding';
import { batteryWisdom, wisdomEdge } from './plate';
import { advanceAll, type Bases, type Runner } from './runners';
import type { ErrorRecord, GamePlan, RunnerMove, Stage, StealPolicy } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const d = (value: number, max: number) => value / max - BASELINE;

export function stealPolicyOf(plan: GamePlan, playerId: string): StealPolicy {
  return plan.stealPolicy?.[playerId] ?? 'normal';
}

/** 企図のしきい値（盗塁禁止なら企図しない＝null） */
export function stealThreshold(policy: StealPolicy): number | null {
  if (policy === 'none') return null;
  return policy === 'aggressive' ? STEAL.threshold.aggressive : STEAL.threshold.normal;
}

/**
 * 盗塁の成功率（見込み成功率と実際の判定で共通）。
 * 走者：盗塁・走力・賢さ／守備側：投手のクイック・球速、捕手の送球、賢さ（投手と捕手の高い方）
 */
export function stealSuccessProbability(runner: Player, to: 2 | 3 | 4, pitcher: Player, catcher: Player): number {
  const M = FIELDER_ABILITY_MAX;
  const base = to === 2 ? STEAL.base.second : to === 3 ? STEAL.base.third : STEAL.base.home;
  const vel = (pitcher.pitcher.velocityKmh - VELOCITY_BASE_KMH) / (VELOCITY_MAX_KMH - VELOCITY_BASE_KMH);
  const p =
    base +
    STEAL.steal * d(runner.fielder.steal, M) +
    STEAL.speed * d(runner.fielder.speed, M) +
    STEAL.wisdom * wisdomEdge(runner.wisdom, batteryWisdom(pitcher, catcher)) -
    STEAL.quick * d(pitcher.pitcher.quick, QUICK_MAX) -
    STEAL.vel * (vel - BASELINE) -
    STEAL.arm * d(catcher.fielder.arm, M);
  return clamp(p, STEAL.min, to === 4 ? Math.min(STEAL.max, STEAL.homeMax) : STEAL.max);
}

export interface StealCandidate {
  runner: Runner;
  from: 1 | 2 | 3;
  to: 2 | 3 | 4;
  policy: StealPolicy;
  expected: number;
}

/**
 * 盗塁を企図するかを決める。次の塁が空いている走者のうち、見込み成功率が積極度のしきい値以上の走者。
 * 複数いれば見込み成功率の高い方（重盗はしない）。アウトカウントは見込み成功率に影響しない。
 */
export function decideSteal(
  bases: Bases,
  offensePlan: GamePlan,
  pitcher: Player,
  catcher: Player,
  playerOf: (id: string) => Player,
): StealCandidate | null {
  let best: StealCandidate | null = null;
  for (const from of [1, 2, 3] as const) {
    const runner = bases[from - 1];
    if (!runner) continue;
    const to = (from + 1) as 2 | 3 | 4;
    if (to !== 4 && bases[to - 1]) continue;
    const policy = stealPolicyOf(offensePlan, runner.id);
    const threshold = stealThreshold(policy);
    if (threshold === null) continue;
    const expected = stealSuccessProbability(playerOf(runner.id), to, pitcher, catcher);
    if (expected < threshold) continue;
    if (!best || expected > best.expected) best = { runner, from, to, policy, expected };
  }
  return best;
}

export interface StealOutcome {
  success: boolean;
  bases: Bases;
  outs: number;
  moves: RunnerMove[];
  scored: Runner[];
  errors: ErrorRecord[];
}

/**
 * 盗塁を実行する。送球（二盗：捕手→二塁手、三盗：捕手→三塁手、本盗：投手→捕手）のエラー判定を行い、
 * エラーなら走者は盗塁成功＋全走者が1つ先へ。エラーがなければ成功率（見込み成功率と同じ式）で成否を決める。
 */
export function executeSteal(
  rng: Rng,
  candidate: StealCandidate,
  state: { bases: Bases; outs: number },
  defenseStage: Stage,
  playerOf: (id: string) => Player,
): StealOutcome {
  const { runner, from, to } = candidate;
  const moves: RunnerMove[] = [];
  const scored: Runner[] = [];
  const errors: ErrorRecord[] = [];
  let bases: Bases = [...state.bases] as Bases;
  bases[from - 1] = null;

  const chain = runFieldingChain(rng, stealThrowSteps(to), defenseStage, playerOf);
  const success = chain !== null || rng.next() < candidate.expected;
  let outs = state.outs;
  if (success) {
    moves.push({ runnerId: runner.id, from, to });
    if (to === 4) scored.push(runner);
    else bases[to - 1] = runner;
  } else {
    moves.push({ runnerId: runner.id, from, to: 0 });
    outs++;
  }
  if (chain) {
    errors.push(chain.error);
    const origin = new Map<string, 0 | 1 | 2 | 3>(
      state.bases.flatMap((r, i) => (r ? [[r.id, (i + 1) as 1 | 2 | 3] as const] : [])),
    );
    bases = advanceAll(bases, moves, scored, (r) => origin.get(r.id) ?? 0);
  }
  return { success, bases, outs: Math.min(outs, OUTS_PER_INNING), moves, scored, errors };
}
