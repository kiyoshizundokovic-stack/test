/**
 * エラー判定（SPEC 3.4）。
 * 守備は「捕球 → 送球 → 送球を受けた選手の捕球」という動作の連鎖として扱い、動作ごとにエラーを判定する。
 * 捕球の動作はその選手の「捕球」と「賢さ」、送球の動作は「送球」と「賢さ」が影響する（捕球・送球が大きく、賢さは小さく）。
 */
import { BASELINE, ERRORS, FIELDER_ABILITY_MAX, WISDOM_MAX } from '../config';
import type { Rng } from '../rng';
import type { Player } from '../types';
import type { BattedType, ErrorRecord, FieldingAction, Position, Stage } from './types';

/** 動作の種類（打球の捕球は打球種類ごとに難しさが違う） */
export type StepKind = BattedType | 'throw' | 'receive';

export interface FieldingStep {
  position: Position;
  kind: StepKind;
}

export function actionOf(kind: StepKind): FieldingAction {
  return kind === 'throw' ? 'throw' : kind === 'receive' ? 'receive' : 'field';
}

/** 1つの動作でエラーが起きる確率 */
export function errorProbability(kind: StepKind, player: Player): number {
  const skill = kind === 'throw' ? player.fielder.arm : player.fielder.catching;
  const exponent =
    -ERRORS.ability * (skill / FIELDER_ABILITY_MAX - BASELINE) - ERRORS.wisdom * (player.wisdom / WISDOM_MAX - BASELINE);
  return Math.min(ERRORS.max, ERRORS.base[kind] * Math.exp(exponent));
}

/**
 * 動作の連鎖を順に判定し、最初にエラーが起きた動作の位置とその記録を返す（エラーなしなら null）。
 * 乱数は動作ごとに1回ずつ消費する（エラーが起きた時点で打ち切る）。
 */
export function runFieldingChain(
  rng: Rng,
  steps: readonly FieldingStep[],
  stage: Stage,
  playerOf: (id: string) => Player,
): { index: number; error: ErrorRecord } | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const id = stage.positions[step.position];
    if (rng.next() < errorProbability(step.kind, playerOf(id))) {
      return { index: i, error: { playerId: id, position: step.position, action: actionOf(step.kind) } };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 打球・送球の動作の連鎖（どの守備位置の選手が、どの動作を行うか）
// ---------------------------------------------------------------------------

/** 二塁での封殺を受ける選手（打球を捕った選手が二塁手なら遊撃手、それ以外は二塁手） */
export function secondBaseCover(fielder: Position): Position {
  return fielder === '2B' ? 'SS' : '2B';
}

/** 一塁で送球を受ける選手（一塁手自身が打球を捕った場合は投手がベースカバー） */
export function firstBaseCover(fielder: Position): Position {
  return fielder === '1B' ? 'P' : '1B';
}

/** フライ・ライナーのアウト：捕球のみ */
export function catchSteps(type: BattedType, fielder: Position): FieldingStep[] {
  return [{ position: fielder, kind: type }];
}

/** 打者を一塁で刺すゴロ：捕球＋送球＋受け手の捕球（一塁手が捕った場合は自分でベースを踏むので捕球のみ） */
export function groundOutSteps(fielder: Position): FieldingStep[] {
  if (fielder === '1B') return [{ position: '1B', kind: 'groundBall' }];
  return [
    { position: fielder, kind: 'groundBall' },
    { position: fielder, kind: 'throw' },
    { position: '1B', kind: 'receive' },
  ];
}

/** 二塁封殺（併殺崩れ）：捕球＋二塁への送球＋受け手の捕球 */
export function forceAtSecondSteps(fielder: Position): FieldingStep[] {
  const cover = secondBaseCover(fielder);
  return [
    { position: fielder, kind: 'groundBall' },
    { position: fielder, kind: 'throw' },
    { position: cover, kind: 'receive' },
  ];
}

/** 併殺：二塁封殺の後、二塁の選手が一塁へ送球し、一塁の受け手が捕球 */
export function doublePlaySteps(fielder: Position): FieldingStep[] {
  const cover = secondBaseCover(fielder);
  return [
    ...forceAtSecondSteps(fielder),
    { position: cover, kind: 'throw' },
    { position: firstBaseCover(fielder), kind: 'receive' },
  ];
}

/** 塁へ走る走者を刺す送球の受け手（本塁=捕手、三塁=三塁手、二塁=二塁手） */
export function baseReceiver(base: 2 | 3 | 4): Position {
  return base === 4 ? 'C' : base === 3 ? '3B' : '2B';
}

/** 送球＋受け手の捕球（タッチアップ・本塁送球・進塁を狙う走者への送球） */
export function throwSteps(thrower: Position, base: 2 | 3 | 4): FieldingStep[] {
  return [
    { position: thrower, kind: 'throw' },
    { position: baseReceiver(base), kind: 'receive' },
  ];
}

/** 盗塁時の送球：二盗は捕手→二塁手、三盗は捕手→三塁手、本盗は投手→捕手 */
export function stealThrowSteps(to: 2 | 3 | 4): FieldingStep[] {
  if (to === 4) return throwSteps('P', 4);
  return throwSteps('C', to);
}
