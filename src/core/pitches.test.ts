import { describe, expect, it } from 'vitest';
import { PITCH_COUNT_MAX, PITCH_COUNT_MIN, PITCH_RATING_MAX } from './config';
import { PITCH_TOTAL_MAX } from './pitches';
import { generatePitches, validatePitches } from './pitches';
import { Rng } from './rng';

describe('球種生成', () => {
  it('どの合計値でもルールを満たす（ストレート必須・1〜5球種・重複なし・評価1〜10）', () => {
    const rng = new Rng(123);
    for (let total = -5; total <= 110; total++) {
      for (let n = 0; n < 20; n++) {
        const pitches = generatePitches(rng, total);
        expect(validatePitches(pitches)).toEqual([]);
        expect(pitches[0]!.type).toBe('straight');
        expect(pitches.length).toBeGreaterThanOrEqual(PITCH_COUNT_MIN);
        expect(pitches.length).toBeLessThanOrEqual(PITCH_COUNT_MAX);
      }
    }
  });

  it('評価値の合計は目標値（範囲内に丸めたもの）と一致する', () => {
    const rng = new Rng(9);
    for (const total of [1, 7, 10, 11, 20, 33, 49, 50]) {
      const sum = generatePitches(rng, total).reduce((s, p) => s + p.rating, 0);
      expect(sum).toBe(total);
    }
    expect(PITCH_TOTAL_MAX).toBe(50);
    expect(generatePitches(rng, 500).reduce((s, p) => s + p.rating, 0)).toBe(PITCH_TOTAL_MAX);
    expect(generatePitches(rng, 0).reduce((s, p) => s + p.rating, 0)).toBe(1);
  });

  it('合計が最大（50）なら5球種すべて10', () => {
    const pitches = generatePitches(new Rng(1), PITCH_TOTAL_MAX);
    expect(pitches).toHaveLength(5);
    expect(pitches.every((p) => p.rating === PITCH_RATING_MAX)).toBe(true);
  });

  it('合計が1球種で収まらない場合は複数球種になる', () => {
    expect(generatePitches(new Rng(1), PITCH_RATING_MAX + 1).length).toBeGreaterThanOrEqual(2);
  });

  it('validatePitches はルール違反を検出する', () => {
    expect(validatePitches([])).not.toEqual([]);
    expect(validatePitches([{ type: 'curve', rating: 10 }])).not.toEqual([]); // ストレートなし
    expect(validatePitches([{ type: 'straight', rating: PITCH_RATING_MAX + 1 }])).not.toEqual([]); // 上限超え
    expect(validatePitches([{ type: 'straight', rating: 0 }])).not.toEqual([]); // 下限未満
    expect(
      validatePitches([
        { type: 'straight', rating: 5 },
        { type: 'straight', rating: 5 },
      ]),
    ).not.toEqual([]); // 重複
    const six = (['straight', 'curve', 'slider', 'sinker', 'cutter', 'knuckle'] as const).map((type) => ({ type, rating: 5 }));
    expect(validatePitches(six)).not.toEqual([]); // 6球種
  });
});
