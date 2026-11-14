/** 走者処理表（runnerTable.ts）を解釈して走者を動かす */
import { BASELINE, FIELDER_ABILITY_MAX, OUTS_PER_INNING, RUNNING } from '../config';
import type { Rng } from '../rng';
import type { Player } from '../types';
import { RUNNER_TABLE, type Base, type Dest, type RuleKey } from './runnerTable';
import type { ErrorRecord, RunnerMove } from './types';

/** 塁上の走者（責任投手を記録する） */
export interface Runner {
  id: string;
  pitcherId: string;
}
export type Bases = [Runner | null, Runner | null, Runner | null];

export interface PlayOutcome {
  bases: Bases;
  outs: number;
  moves: RunnerMove[];
  /** 生還した走者（責任投手付き） */
  scored: Runner[];
  /** 送球で起きたエラー */
  errors: ErrorRecord[];
}

/** 走者を刺す送球のエラー判定（送球＋受け手の捕球）。エラーならその記録を返す */
export type ThrowCheck = (to: 2 | 3 | 4) => ErrorRecord | null;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function runSuccessProbability(kind: 'advance' | 'tagUp', runner: Player, thrower: Player): number {
  const c = RUNNING[kind];
  const M = FIELDER_ABILITY_MAX;
  return clamp(
    c.base + c.speed * (runner.fielder.speed / M - BASELINE) - c.arm * (thrower.fielder.arm / M - BASELINE),
    c.min,
    c.max,
  );
}

/** 押し出しの行き先 */
function forcedDestinations(bases: Bases): Partial<Record<Base, Dest>> {
  const res: Partial<Record<Base, Dest>> = {};
  if (bases[0]) {
    res[1] = 2;
    if (bases[1]) {
      res[2] = 3;
      if (bases[2]) res[3] = 4;
    }
  }
  return res;
}

/** 塁上の全走者を1つずつ進める（先の走者から）。エラー時の「1つ余分な進塁」に使う */
export function advanceAll(
  bases: Bases,
  moves: RunnerMove[],
  scored: Runner[],
  origin: (r: Runner) => 0 | 1 | 2 | 3,
): Bases {
  const next: Bases = [null, null, null];
  for (const b of [3, 2, 1] as Base[]) {
    const r = bases[b - 1];
    if (!r) continue;
    const to = (b + 1) as Dest;
    if (to === 4) scored.push(r);
    else next[to - 1] = r;
    const existing = moves.find((m) => m.runnerId === r.id);
    if (existing) existing.to = to;
    else moves.push({ runnerId: r.id, from: origin(r), to });
  }
  return next;
}

export function applyPlay(
  rng: Rng,
  key: RuleKey,
  state: { bases: Bases; outs: number },
  batter: Runner,
  thrower: Player,
  playerOf: (id: string) => Player,
  throwCheck: ThrowCheck = () => null,
): PlayOutcome {
  const rule = RUNNER_TABLE[key];
  const moves: RunnerMove[] = [];
  const scored: Runner[] = [];
  const errors: ErrorRecord[] = [];
  let outs = state.outs;

  const defaults: Partial<Record<Base, Dest>> =
    rule.runners === 'force' ? forcedDestinations(state.bases) : rule.runners === 'stay' ? {} : rule.runners;

  // 打者・封殺によるアウト数
  let forcedOuts = rule.batter === 0 ? 1 : 0;
  for (const b of [1, 2, 3] as Base[]) if (state.bases[b - 1] && defaults[b] === 0) forcedOuts++;

  if (outs + forcedOuts >= OUTS_PER_INNING) {
    // 3アウト成立：走者は動かず得点もなし
    if (rule.batter === 0) moves.push({ runnerId: batter.id, from: 0, to: 0 });
    for (const b of [3, 2, 1] as Base[]) {
      const r = state.bases[b - 1];
      if (r && defaults[b] === 0) moves.push({ runnerId: r.id, from: b, to: 0 });
    }
    return { bases: [...state.bases] as Bases, outs: OUTS_PER_INNING, moves, scored, errors };
  }
  outs += forcedOuts;

  // 走者の現在位置（元の塁 → 今いる塁）
  const position = new Map<Base, Dest>();
  const originOf = new Map<string, 0 | 1 | 2 | 3>([[batter.id, 0]]);
  let next: Bases = [null, null, null];
  for (const b of [3, 2, 1] as Base[]) {
    const r = state.bases[b - 1];
    if (!r) continue;
    originOf.set(r.id, b);
    const to = defaults[b] ?? b;
    position.set(b, to);
    if (to !== b) moves.push({ runnerId: r.id, from: b, to });
    if (to === 4) scored.push(r);
    else if (to >= 1) next[to - 1] = r;
  }
  if (rule.batter === 0) moves.push({ runnerId: batter.id, from: 0, to: 0 });
  else if (rule.batter === 4) {
    moves.push({ runnerId: batter.id, from: 0, to: 4 });
    scored.push(batter);
  } else {
    moves.push({ runnerId: batter.id, from: 0, to: rule.batter });
    next[rule.batter - 1] = batter;
  }

  // さらに先の塁を狙う
  for (const ex of rule.extras ?? []) {
    if (outs >= OUTS_PER_INNING) break;
    const r = state.bases[ex.from - 1];
    const cur = position.get(ex.from);
    if (!r || cur === undefined || cur === 0 || cur === 4 || cur >= ex.to) continue;
    if (ex.to !== 4 && next[ex.to - 1]) continue; // 塁が埋まっている
    // 途中の塁が詰まっていたら進めない
    let blocked = false;
    for (let b = cur + 1; b < ex.to; b++) if (next[b - 1]) blocked = true;
    if (blocked) continue;
    // 試行確率はプレー前のアウトカウントで引く（打者アウトで増えた後の値ではない）
    if (rng.next() >= (ex.attempt[state.outs] ?? 0)) continue;
    next[cur - 1] = null;

    // 走者を刺す送球のエラー判定（アウトのリスクがある進塁のみ送球が行われる）
    const error = ex.risky ? throwCheck(ex.to) : null;
    const success = error !== null || !ex.risky || rng.next() < runSuccessProbability(ex.kind, playerOf(r.id), thrower);
    if (success) {
      position.set(ex.from, ex.to);
      if (ex.to === 4) scored.push(r);
      else next[ex.to - 1] = r;
    } else {
      position.set(ex.from, 0);
      outs++;
    }
    // 同じ走者の move を最終的な行き先に更新
    const existing = moves.find((m) => m.runnerId === r.id);
    const finalTo = success ? ex.to : 0;
    if (existing) existing.to = finalTo;
    else moves.push({ runnerId: r.id, from: ex.from, to: finalTo });

    if (error) {
      // エラー：塁上の全走者（打者走者を含む）がさらに1つ進み、以降の進塁判定は行わない
      errors.push(error);
      next = advanceAll(next, moves, scored, (x) => originOf.get(x.id) ?? 0);
      break;
    }
  }

  return { bases: next, outs, moves, scored, errors };
}
