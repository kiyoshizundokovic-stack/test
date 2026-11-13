import { OVERALL_WEIGHTS as W, VELOCITY_BASE_KMH } from './config';
import { FIELDER_ABILITY_KEYS, type Pitch, type Player } from './types';

/** 球速の能力値（km/h − 基準値） */
export function velocityValue(kmh: number): number {
  return kmh - VELOCITY_BASE_KMH;
}

/** 球種評価値の合計 */
export function pitchTotal(pitches: readonly Pitch[]): number {
  return pitches.reduce((s, p) => s + p.rating, 0);
}

/** 野手8能力の合計（倍率適用前） */
export function fielderTotal(player: Player): number {
  return FIELDER_ABILITY_KEYS.reduce((s, k) => s + player.fielder[k], 0);
}

/** 投手能力の総合力への寄与（球速×3 + クイック + 球種合計×3 + コントロール + スタミナ） */
export function pitcherTotal(player: Player): number {
  const p = player.pitcher;
  return (
    velocityValue(p.velocityKmh) * W.velocity +
    p.quick * W.quick +
    pitchTotal(p.pitches) * W.pitches +
    p.control * W.control +
    p.stamina * W.stamina
  );
}

/**
 * 総合力（SPEC 2.3。最大1500）
 * = 野手8能力 + 賢さ + (km/h−120)×3 + クイック + 球種合計×3 + コントロール + スタミナ（球数）
 * 選手の価値（獲得コスト・売却額）もこの値と 1:1。
 */
export function calcOverall(player: Player): number {
  return fielderTotal(player) * W.fielder + player.wisdom * W.wisdom + pitcherTotal(player);
}
