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
import { buildAutoPlan, pitchingScore, validatePlanDetailed } from './plan';
import { POSITIONS, type GamePlan, type Position, type Stage, type StealPolicy } from './types';

const clonePlan = (plan: GamePlan): GamePlan => ({
  stages: plan.stages.map((s) => ({ lineup: [...s.lineup], positions: { ...s.positions } })),
  ...(plan.stealPolicy ? { stealPolicy: { ...plan.stealPolicy } } : {}),
});

/** 選手の盗塁の積極度を設定する（「通常」は既定値なので記録から外す） */
export function setStealPolicy(plan: GamePlan, playerId: string, policy: StealPolicy): GamePlan {
  const next = clonePlan(plan);
  const map = { ...(next.stealPolicy ?? {}) };
  if (policy === 'normal') delete map[playerId];
  else map[playerId] = policy;
  if (Object.keys(map).length > 0) next.stealPolicy = map;
  else delete next.stealPolicy;
  return next;
}

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

/**
 * ロースターの変化（獲得・売却）に合わせて前回の作戦を直す（SPEC 4.3）。
 * - いなくなった選手の守備位置は、その段階に出ていない選手（作戦で未使用の選手を優先）で埋める
 * - 埋められない段階（とそれ以降）は削除する。先発の段階が直せなければ作戦AIで作り直す
 * - いなくなった選手の盗塁の積極度は削除する
 * 戻り値の notes に直した内容を入れる（UIで「確認してください」と表示する）。
 * 直した結果がバリデーションを通らない場合もある（再出場など）。その場合はUIで再設定を促す。
 */
export function reconcilePlan(
  plan: GamePlan,
  roster: readonly Player[],
  name: (id: string) => string = (id) => id,
): { plan: GamePlan; notes: string[] } {
  const ids = new Set(roster.map((p) => p.id));
  const missing = new Set(plan.stages.flatMap((s) => playersOnField(s)).filter((id) => !ids.has(id)));
  const policies = plan.stealPolicy ? Object.fromEntries(Object.entries(plan.stealPolicy).filter(([id]) => ids.has(id))) : undefined;
  if (missing.size === 0) {
    const next = clonePlan(plan);
    if (policies && Object.keys(policies).length > 0) next.stealPolicy = policies;
    else delete next.stealPolicy;
    return { plan: next, notes: [] };
  }

  const notes: string[] = [];
  const next = clonePlan(plan);
  const usedInPlan = new Set(next.stages.flatMap((s) => playersOnField(s)));
  const stages: Stage[] = [];
  for (let i = 0; i < next.stages.length; i++) {
    const stage = next.stages[i]!;
    const working: GamePlan = { stages: [...stages, stage] };
    const removed = removedBefore(working, i);
    let ok = true;
    for (const pos of POSITIONS) {
      const id = stage.positions[pos];
      if (ids.has(id)) continue;
      const onField = new Set(playersOnField(stage));
      // 前の段階に出ていた選手（この段階で退く選手）を戻すと交代の取り消しになるので候補にしない
      const prevField = new Set(i > 0 ? playersOnField(stages[i - 1]!) : []);
      const candidates = roster.filter((p) => !onField.has(p.id) && !removed.has(p.id) && !prevField.has(p.id));
      if (candidates.length === 0) {
        ok = false;
        break;
      }
      // 作戦で未使用の選手を優先し、その中では投手なら投手能力、野手なら守備の能力が高い選手
      const score = (p: Player) =>
        (usedInPlan.has(p.id) ? 0 : 1000) +
        (pos === 'P' ? pitchingScore(p) * 100 : p.fielder.fielding + p.fielder.catching + p.fielder.arm);
      const pick = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
      stage.positions[pos] = pick.id;
      usedInPlan.add(pick.id);
      notes.push(`${i === 0 ? '先発' : `${i + 1}番手`}の段階：${name(id)}がいないため、${pick.name.family} ${pick.name.given}を配置しました`);
    }
    if (!ok) {
      notes.push(`${i === 0 ? '先発' : `${i + 1}番手`}以降の継投の段階は、配置できる選手が足りないため削除しました`);
      break;
    }
    // 打順の整合（いなくなった選手は前の段階の打順に残っているので、ここで入れ替える）
    stages.push(stage);
  }

  if (stages.length === 0) {
    notes.push('作戦を作り直しました');
    return { plan: buildAutoPlan(roster), notes };
  }
  // 先発の段階の打順に残ったいなくなった選手を、その守備位置に入った選手で置き換えてから整合させる
  const first = stages[0]!;
  first.lineup = first.lineup.map((id) => (ids.has(id) ? id : ''));
  const placed = playersOnField(first);
  const entrants = placed.filter((id) => !first.lineup.includes(id));
  first.lineup = first.lineup.map((id) => (id === '' ? entrants.shift()! : id));
  let result: GamePlan = normalizePlan({ stages });
  // 穴埋めに使った控えが次の段階の投手でもあると、同じ投手が続く段階ができる。その段階はまとめる
  const merged: Stage[] = [];
  for (const st of result.stages) {
    const prev = merged[merged.length - 1];
    if (prev && prev.positions.P === st.positions.P) {
      notes.push('同じ投手が続く継投の段階をまとめました');
      continue;
    }
    merged.push(st);
  }
  result = normalizePlan({ stages: merged });
  // それでも無効な段階があれば、その段階以降を削除する（先発の段階が無効なら作り直す）
  const issues = validatePlanDetailed(result, roster);
  const firstBad = issues.reduce((m, i) => Math.min(m, i.stage ?? 0), Infinity);
  if (firstBad === 0) {
    notes.push('作戦を作り直しました');
    return { plan: buildAutoPlan(roster), notes };
  }
  if (Number.isFinite(firstBad)) {
    notes.push(`${firstBad + 1}番手以降の継投の段階は、整合が取れないため削除しました`);
    result = { stages: result.stages.slice(0, firstBad) };
  }
  if (policies && Object.keys(policies).length > 0) result.stealPolicy = policies;
  return { plan: result, notes };
}
