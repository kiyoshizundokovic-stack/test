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
 * 打力（ミート+パワー）上位3人をパワー順に4・3・5番、残りから出塁・機動力（ミート+選球眼+走力+盗塁）の上位2人を1・2番、
 * 残りを打力順に6〜9番。
 */
export function autoBattingOrder(nine: readonly Player[]): string[] {
  const bat = (p: Player) => p.fielder.contact + p.fielder.power;
  const sorted = [...nine].sort((a, b) => bat(b) - bat(a));
  const cleanup = sorted.slice(0, 3).sort((a, b) => b.fielder.power - a.fielder.power);
  const rest = sorted.slice(3);
  const table = (p: Player) => p.fielder.contact + p.fielder.eye + p.fielder.speed + p.fielder.steal;
  const top = [...rest].sort((a, b) => table(b) - table(a)).slice(0, 2);
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
 * - 盗塁の積極度：全員「通常」（stealPolicy を指定しない）
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

/** 継投段階の表示名（0 = 先発、1 = 2番手 …） */
export function stageLabel(index: number): string {
  return index === 0 ? '先発' : `${index + 1}番手`;
}

export interface PlanIssue {
  /** 問題のある段階（作戦全体の問題なら null） */
  stage: number | null;
  message: string;
}

/** 作戦のバリデーション（段階ごとの問題点）。空なら有効 */
export function validatePlanDetailed(plan: GamePlan, players: readonly Player[]): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.name.family} ${p.name.given}` : `不明な選手(${id})`;
  };
  if (plan.stages.length === 0) return [{ stage: null, message: '継投の段階が1つもありません' }];
  const removed = new Set<string>();
  plan.stages.forEach((stage, i) => {
    const add = (message: string) => issues.push({ stage: i, message: `${stageLabel(i)}: ${message}` });
    if (stage.lineup.length !== 9) add('打順が9人ではありません');
    if (new Set(stage.lineup).size !== stage.lineup.length) add('打順に同じ選手が重複しています');
    const placed = POSITIONS.map((pos) => stage.positions[pos]);
    if (placed.some((id) => id === undefined)) add('守備位置に空きがあります');
    else if (new Set(placed).size !== 9) add('同じ選手が複数の守備位置に就いています');
    for (const id of stage.lineup) {
      if (!byId.has(id)) add(`${name(id)}はチームにいません`);
      if (removed.has(id)) add(`${name(id)}は一度退いたため再出場できません`);
    }
    if (!placed.every((id) => id !== undefined && stage.lineup.includes(id))) {
      add('守備に就く選手と打順の選手が一致しません');
    }
    const prev = plan.stages[i - 1];
    if (prev) {
      prev.lineup.forEach((id, slot) => {
        if (stage.lineup.includes(id) && stage.lineup[slot] !== id) {
          add(`${name(id)}の打順が変わっています（打順は人に紐づきます）`);
        }
        if (!stage.lineup.includes(id)) removed.add(id);
      });
      if (stage.positions.P === prev.positions.P) add('投手が前の段階と同じです（投手を交代してください）');
    }
  });
  return issues;
}

/** 作戦のバリデーション。エラーメッセージの配列を返す（空なら有効） */
export function validatePlan(plan: GamePlan, players: readonly Player[]): string[] {
  return validatePlanDetailed(plan, players).map((i) => i.message);
}
