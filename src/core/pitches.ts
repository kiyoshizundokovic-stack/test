import { PITCH_COUNT_MAX, PITCH_COUNT_MIN, PITCH_RATING_MAX, PITCH_RATING_MIN } from './config';
import type { Rng } from './rng';
import { PITCH_TYPES, type Pitch, type PitchType } from './types';

/** 球種合計として取りうる最小値・最大値 */
export const PITCH_TOTAL_MIN = PITCH_RATING_MIN * PITCH_COUNT_MIN;
export const PITCH_TOTAL_MAX = PITCH_RATING_MAX * PITCH_COUNT_MAX;

/**
 * 球種を生成する。
 * - ストレートは必ず先頭に含む
 * - 球種数は PITCH_COUNT_MIN〜MAX、残りはストレート以外から重複なしで選ぶ
 * - 各評価値は PITCH_RATING_MIN〜MAX、合計は targetTotal（取りうる範囲に丸める）
 * @param pitchesPerCount 球種数決定の目安（合計 / この値 ≒ 球種数）
 */
export function generatePitches(rng: Rng, targetTotal: number, pitchesPerCount = 12): Pitch[] {
  const total = Math.round(Math.min(PITCH_TOTAL_MAX, Math.max(PITCH_TOTAL_MIN, targetTotal)));

  // 合計を満たせる球種数の範囲
  const minCount = Math.max(PITCH_COUNT_MIN, Math.ceil(total / PITCH_RATING_MAX));
  const maxCount = Math.min(PITCH_COUNT_MAX, Math.floor(total / PITCH_RATING_MIN));
  const center = total / pitchesPerCount + rng.range(-1, 1);
  const count = Math.min(maxCount, Math.max(minCount, Math.round(center)));

  const others = rng.shuffle(PITCH_TYPES.filter((t) => t !== 'straight'));
  const types: PitchType[] = ['straight', ...others.slice(0, count - 1)];

  // 全球種を最小値で初期化し、残りを上限未満の球種へランダムに1ずつ配分
  const ratings = types.map(() => PITCH_RATING_MIN);
  let remaining = total - PITCH_RATING_MIN * count;
  while (remaining > 0) {
    const candidates = ratings.map((r, i) => (r < PITCH_RATING_MAX ? i : -1)).filter((i) => i >= 0);
    const i = rng.pick(candidates);
    ratings[i] = (ratings[i] as number) + 1;
    remaining--;
  }

  return types.map((type, i) => ({ type, rating: ratings[i] as number }));
}

/** 球種リストがルールを満たすか検証（テスト・セーブデータ読み込み時の検査用） */
export function validatePitches(pitches: readonly Pitch[]): string[] {
  const errors: string[] = [];
  if (pitches.length < PITCH_COUNT_MIN || pitches.length > PITCH_COUNT_MAX) {
    errors.push(`球種数が範囲外: ${pitches.length}`);
  }
  if (!pitches.some((p) => p.type === 'straight')) errors.push('ストレートを所持していない');
  if (new Set(pitches.map((p) => p.type)).size !== pitches.length) errors.push('球種が重複している');
  for (const p of pitches) {
    if (!Number.isInteger(p.rating) || p.rating < PITCH_RATING_MIN || p.rating > PITCH_RATING_MAX) {
      errors.push(`評価値が範囲外: ${p.type}=${p.rating}`);
    }
  }
  return errors;
}
