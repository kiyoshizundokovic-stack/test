import { VELOCITY_BASE_KMH } from './config';
import { FIELDER_ABILITY_KEYS, type Pitch, type Player } from './types';

/** 球速の能力値（km/h − 基準値） */
export function velocityValue(kmh: number): number {
  return kmh - VELOCITY_BASE_KMH;
}

/** 球種評価値の合計 */
export function pitchTotal(pitches: readonly Pitch[]): number {
  return pitches.reduce((s, p) => s + p.rating, 0);
}

/** 野手6能力の合計 */
export function fielderTotal(player: Player): number {
  return FIELDER_ABILITY_KEYS.reduce((s, k) => s + player.fielder[k], 0);
}

/** 投手能力の合計（球速値 + コントロール + スタミナ + 球種合計） */
export function pitcherTotal(player: Player): number {
  const p = player.pitcher;
  return velocityValue(p.velocityKmh) + p.control + p.stamina + pitchTotal(p.pitches);
}

/**
 * 総合力 = 野手6能力 + 球速（km/h−120）+ コントロール + スタミナ（球数）+ 球種合計
 * 選手の価値（獲得コスト・売却額）もこの値と 1:1。
 */
export function calcOverall(player: Player): number {
  return fielderTotal(player) + pitcherTotal(player);
}
