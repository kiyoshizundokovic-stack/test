/**
 * 作戦の編集操作（作戦設定UIから呼ぶ純粋関数）。
 * どの操作も元の plan を変更せず、新しい plan を返す。
 *
 * 打順の扱い（SPEC 4.1・4.2）：
 * - 打順は人に紐づく。前の段階から続けて出場する選手は同じ打順のまま
 * - 新しく出場した選手は、その段階で退いた選手の打順を引き継ぐ
 * - 入る選手が複数いる場合、どの打順を引き継ぐかは setEntrantSlot で指定する
 * 守備位置を変えたあとは normalizePlan で各段階の打順を上の規則に合わせ直す。
 */
import type { Player } from '../types';
import { pitchingScore } from './plan';
import { POSITIONS, type GamePlan, type Position, type Stage } from './types';

const clonePlan = (plan: GamePlan): GamePlan => ({
  stages: plan.stages.map((s) => ({ lineup: [...s.lineup], positions: { ...s.positions } })),
});

/** 段階に出場している選手（守備位置に就いている9人） */
export function playersOnField(stage: Stage): string[] {
  return POSITIONS.map((pos) => stage.positions[pos]);
}

export function positionOf(stage: Stage, playerId: string): Position | undefined {
  return POSITIONS.find((pos) => stage.positions[pos] === playerId);
}

/**
 * 前の段階の打順と、この段階で守備に就く選手から打順を決める。
 * @param prevLineup 前の段階の打順（先発の段階では編集前の自分の打順）
 * @param preferred  入る選手の希望打順（既存の打順。空いた打順なら尊重する）
 */
export function fitLineup(prevLineup: readonly string[], onField: readonly string[], preferred: readonly string[]): string[] {
  const fieldSet = new Set(onField);
  const lineup: (string | null)[] = prevLineup.map((id) => (fieldSet.has(id) ? id : null));
  const entrants = onField.filter((id) => !prevLineup.includes(id));
  const pending: string[] = [];
  for (const id of entrants) {
    const slot = preferred.indexOf(id);
    if (slot >= 0 && slot < lineup.length && lineup[slot] === null) lineup[slot] = id;
    else pending.push(id);
  }
  // 残りは空いている打順の若い順（編集は1人ずつ行うので、通常は退いた選手の打順そのもの）
  for (const id of pending) {
    const free = lineup.indexOf(null);
    lineup[free] = id;
  }
  return lineup.map((id) => id!);
}

/** 全段階の打順を「打順は人に紐づく」規則に合わせ直す */
export function normalizePlan(plan: GamePlan): GamePlan {
  const next = clonePlan(plan);
  next.stages.forEach((stage, i) => {
    const onField = playersOnField(stage);
    // 先発の段階は編集前の自分の打順を基準にする（退いた選手の打順を入った選手が引き継ぐ）
    const prevLineup = i === 0 ? stage.lineup : next.stages[i - 1]!.lineup;
    stage.lineup = fitLineup(prevLineup, onField, stage.lineup);
  });
  return next;
}

/** 打順の a 番と b 番を入れ替える（0始まり）。打順は人に紐づくので全段階に適用する */
export function swapBattingSlots(plan: GamePlan, a: number, b: number): GamePlan {
  const next = clonePlan(plan);
  for (const stage of next.stages) {
    const tmp = stage.lineup[a]!;
    stage.lineup[a] = stage.lineup[b]!;
    stage.lineup[b] = tmp;
  }
  return next;
}

/** 打順の from 番の選手を to 番へ移動する（間の選手は1つずつずれる）。全段階に適用する */
export function moveBattingSlot(plan: GamePlan, from: number, to: number): GamePlan {
  let next = plan;
  const step = from < to ? 1 : -1;
  for (let i = from; i !== to; i += step) next = swapBattingSlots(next, i, i + step);
  return next;
}

/**
 * 段階 stageIndex の守備位置 pos に選手を配置する。
 * - その選手が既に別の守備位置にいれば、2人の守備位置を入れ替える
 * - 控え（またはこの段階にいない選手）なら、pos にいた選手と交代する（打順は退いた選手のものを引き継ぐ）
 * 段階0（先発）の変更は、以降の段階でその選手がそのまま出場し続けている位置にも反映する。
 */
export function assignPosition(plan: GamePlan, stageIndex: number, pos: Position, playerId: string): GamePlan {
  const next = clonePlan(plan);
  const stage = next.stages[stageIndex];
  if (!stage) return plan;
  const current = stage.positions[pos];
  if (current === playerId) return plan;
  const before = { ...stage.positions };
  const otherPos = positionOf(stage, playerId);
  if (otherPos) {
    stage.positions[otherPos] = current;
    stage.positions[pos] = playerId;
  } else {
    stage.positions[pos] = playerId;
  }
  // 以降の段階のうち、変更前と同じ配置を引き継いでいる守備位置には同じ変更を反映する
  for (let j = stageIndex + 1; j < next.stages.length; j++) {
    const later = next.stages[j]!;
    const touched: Position[] = otherPos ? [pos, otherPos] : [pos];
    // この段階で既に配置されている選手を重複させない
    const unchanged = touched.every((p) => later.positions[p] === before[p]);
    if (!unchanged) break;
    const newcomers = touched.map((p) => stage.positions[p]).filter((id) => !touched.some((p) => later.positions[p] === id));
    if (newcomers.some((id) => playersOnField(later).includes(id))) break;
    for (const p of touched) later.positions[p] = stage.positions[p];
  }
  return normalizePlan(next);
}

/** 段階に新しく入った選手（前の段階にいなかった選手）と、空いた打順 */
export function entrantsOf(plan: GamePlan, stageIndex: number): { entrants: string[]; vacatedSlots: number[] } {
  const stage = plan.stages[stageIndex];
  const prev = plan.stages[stageIndex - 1];
  if (!stage || !prev) return { entrants: [], vacatedSlots: [] };
  const onField = new Set(playersOnField(stage));
  const vacatedSlots = prev.lineup.map((id, slot) => (onField.has(id) ? -1 : slot)).filter((s) => s >= 0);
  const entrants = vacatedSlots.map((slot) => stage.lineup[slot]!);
  return { entrants, vacatedSlots };
}

/** 新しく入った選手が引き継ぐ打順を指定する（同じ段階で入った別の選手と打順を入れ替える） */
export function setEntrantSlot(plan: GamePlan, stageIndex: number, playerId: string, slot: number): GamePlan {
  const { entrants, vacatedSlots } = entrantsOf(plan, stageIndex);
  if (!entrants.includes(playerId) || !vacatedSlots.includes(slot)) return plan;
  const next = clonePlan(plan);
  const lineup = next.stages[stageIndex]!.lineup;
  const from = lineup.indexOf(playerId);
  lineup[from] = lineup[slot]!;
  lineup[slot] = playerId;
  return normalizePlan(next);
}

/** この段階より前に出場して退いた選手（再出場できない） */
export function removedBefore(plan: GamePlan, stageIndex: number): Set<string> {
  // 段階 j−1 → j（j < stageIndex）の交代で退いた選手。
  // 段階 stageIndex で退く選手は、その段階の編集で戻せるので含めない。
  const removed = new Set<string>();
  for (let j = 1; j < stageIndex && j < plan.stages.length; j++) {
    const field = new Set(playersOnField(plan.stages[j]!));
    for (const id of playersOnField(plan.stages[j - 1]!)) if (!field.has(id)) removed.add(id);
  }
  return removed;
}

/** 段階 stageIndex で配置できる選手か（退いた選手は不可） */
export function canPlaceInStage(plan: GamePlan, stageIndex: number, playerId: string): boolean {
  return !removedBefore(plan, stageIndex).has(playerId);
}

/**
 * 継投の段階を末尾に追加する。直前の段階をコピーし、まだ出場していない控えのうち
 * 投手能力が最も高い選手を投手に入れる（控えがいなければ配置はそのまま。ユーザーが変更する）。
 */
export function addStage(plan: GamePlan, players: readonly Player[]): GamePlan {
  const next = clonePlan(plan);
  const last = next.stages[next.stages.length - 1]!;
  const used = new Set(next.stages.flatMap((s) => playersOnField(s)));
  const bench = players.filter((p) => !used.has(p.id));
  const stage: Stage = { lineup: [...last.lineup], positions: { ...last.positions } };
  next.stages.push(stage);
  if (bench.length > 0) {
    const best = bench.reduce((a, b) => (pitchingScore(b) > pitchingScore(a) ? b : a));
    stage.positions.P = best.id;
    return normalizePlan(next);
  }
  return next;
}

/** 段階を削除する（先発の段階は削除できない） */
export function removeStage(plan: GamePlan, stageIndex: number): GamePlan {
  if (stageIndex <= 0 || stageIndex >= plan.stages.length) return plan;
  const next = clonePlan(plan);
  next.stages.splice(stageIndex, 1);
  return normalizePlan(next);
}
