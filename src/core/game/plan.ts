import {
  CONTROL_MAX,
  FIELDER_ABILITY_MAX,
  OPPONENT,
  PITCH_COUNT_MAX,
  PITCH_RATING_MAX,
  POSITION_FILL_ORDER,
  POSITION_FIT,
  VELOCITY_BASE_KMH,
  VELOCITY_MAX_KMH,
} from '../config';
import { pitchTotal, velocityValue } from '../overall';
import type { Player } from '../types';
import { POSITIONS, type GamePlan, type Position, type Stage } from './types';

const VEL_RANGE = VELOCITY_MAX_KMH - VELOCITY_BASE_KMH;

/** 投手としての質（スタミナを除く）。0〜3程度 */
export function pitchingScore(p: Player): number {
  return (
    velocityValue(p.pitcher.velocityKmh) / VEL_RANGE +
    p.pitcher.control / CONTROL_MAX +
    pitchTotal(p.pitcher.pitches) / (PITCH_RATING_MAX * PITCH_COUNT_MAX)
  );
}

function fitScore(p: Player, pos: Exclude<Position, 'P'>): number {
  const w = POSITION_FIT[pos];
  const f = p.fielder;
  return (w.catching * f.catching + w.arm * f.arm + w.fielding * f.fielding + w.speed * f.speed) / FIELDER_ABILITY_MAX;
}

/**
 * 能力から簡易に打順を決める（相手AI）。
 * 打力（ミート+パワー）上位3人をパワー順に4・3・5番、残りからミート+走力の上位2人を1・2番、残りを打力順に6〜9番。
 */
export function autoBattingOrder(nine: readonly Player[]): string[] {
  const bat = (p: Player) => p.fielder.contact + p.fielder.power;
  const sorted = [...nine].sort((a, b) => bat(b) - bat(a));
  const cleanup = sorted.slice(0, 3).sort((a, b) => b.fielder.power - a.fielder.power);
  const rest = sorted.slice(3);
  const top = [...rest]
    .sort((a, b) => b.fielder.contact + b.fielder.speed - (a.fielder.contact + a.fielder.speed))
    .slice(0, 2);
  const bottom = rest.filter((p) => !top.includes(p));
  const order = [top[0], top[1], cleanup[1], cleanup[0], cleanup[2], ...bottom];
  return order.map((p) => p!.id);
}

/**
 * 相手AIの作戦を作る（SPEC 5.4）。
 * - 先発：スタミナが starterMinStamina 以上の中で投手としての質が最も高い選手（いなければスタミナ最大）
 * - 控え投手：残りから投手の質の上位 relievers 人（控えが足りなければその人数）
 * - 野手：残りの8人を重要な守備位置から順に適性の高い選手で埋める
 * - 継投：控え投手を順に登板させ、投手の打順・守備位置だけを引き継ぐ
 */
export function buildAutoPlan(players: readonly Player[]): GamePlan {
  if (players.length < 9) throw new Error('buildAutoPlan: 9人以上必要');
  const eligible = players.filter((p) => p.pitcher.stamina >= OPPONENT.starterMinStamina);
  const starter =
    eligible.length > 0
      ? eligible.reduce((a, b) => (pitchingScore(b) > pitchingScore(a) ? b : a))
      : players.reduce((a, b) => (b.pitcher.stamina > a.pitcher.stamina ? b : a));

  const others = players.filter((p) => p !== starter);
  const benchCount = Math.min(OPPONENT.relievers, players.length - 9);
  // 野手として出す8人を先に（野手適性の合計が高い順に）確保し、残りを控え投手とする
  const fieldValue = (p: Player) => Object.values(p.fielder).reduce((s, v) => s + v, 0) - pitchingScore(p) * 60;
  const fieldersPool = [...others].sort((a, b) => fieldValue(b) - fieldValue(a));
  const fielders = fieldersPool.slice(0, 8);
  const relievers = fieldersPool
    .slice(8)
    .sort((a, b) => pitchingScore(b) - pitchingScore(a))
    .slice(0, benchCount);

  const positions = { P: starter.id } as Record<Position, string>;
  const remaining = [...fielders];
  for (const pos of POSITION_FILL_ORDER) {
    const best = remaining.reduce((a, b) => (fitScore(b, pos) > fitScore(a, pos) ? b : a));
    positions[pos] = best.id;
    remaining.splice(remaining.indexOf(best), 1);
  }

  const lineup = autoBattingOrder([starter, ...fielders]);
  const stages: Stage[] = [{ lineup, positions }];
  for (const r of relievers) {
    const prev = stages[stages.length - 1]!;
    const slot = prev.lineup.indexOf(prev.positions.P);
    const nextLineup = [...prev.lineup];
    nextLineup[slot] = r.id;
    stages.push({ lineup: nextLineup, positions: { ...prev.positions, P: r.id } });
  }
  return { stages };
}

/** 作戦のバリデーション。エラーメッセージの配列を返す（空なら有効） */
export function validatePlan(plan: GamePlan, players: readonly Player[]): string[] {
  const errors: string[] = [];
  const ids = new Set(players.map((p) => p.id));
  if (plan.stages.length === 0) return ['段階が1つもない'];
  const removed = new Set<string>();
  plan.stages.forEach((stage, i) => {
    const label = `段階${i + 1}`;
    if (stage.lineup.length !== 9) errors.push(`${label}: 打順が9人でない`);
    if (new Set(stage.lineup).size !== stage.lineup.length) errors.push(`${label}: 打順に重複がある`);
    const placed = POSITIONS.map((pos) => stage.positions[pos]);
    if (placed.some((id) => id === undefined)) errors.push(`${label}: 守備位置に空きがある`);
    if (new Set(placed).size !== 9) errors.push(`${label}: 守備位置に重複がある`);
    for (const id of stage.lineup) {
      if (!ids.has(id)) errors.push(`${label}: 不明な選手 ${id}`);
      if (removed.has(id)) errors.push(`${label}: 退いた選手が再出場している ${id}`);
    }
    if (!placed.every((id) => id !== undefined && stage.lineup.includes(id))) {
      errors.push(`${label}: 守備に就く選手と打順の選手が一致しない`);
    }
    const prev = plan.stages[i - 1];
    if (prev) {
      prev.lineup.forEach((id, slot) => {
        if (stage.lineup.includes(id) && stage.lineup[slot] !== id) {
          errors.push(`${label}: 継続出場の選手の打順が変わっている ${id}`);
        }
        if (!stage.lineup.includes(id)) removed.add(id);
      });
      if (stage.positions.P === prev.positions.P) errors.push(`${label}: 投手が前の段階と同じ`);
    }
  });
  return errors;
}
