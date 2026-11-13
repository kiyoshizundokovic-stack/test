import { describe, expect, it } from 'vitest';
import {
  CONTROL_MAX,
  CONTROL_MIN,
  FIELDER_ABILITY_MAX,
  FIELDER_ABILITY_MIN,
  OVERALL_MAX,
  PITCH_RATING_MAX,
  QUICK_MAX,
  QUICK_MIN,
  STAMINA_MAX,
  STAMINA_MIN,
  VELOCITY_MAX_KMH,
  VELOCITY_MIN_KMH,
  WISDOM_MAX,
  WISDOM_MIN,
} from './config';
import { calcOverall } from './overall';
import { PITCH_TYPES, type Player } from './types';

function makePlayer(
  over: Partial<{ f: number; wisdom: number; kmh: number; quick: number; control: number; stamina: number; pitches: number[] }>,
): Player {
  const f = over.f ?? 50;
  const ratings = over.pitches ?? [10];
  return {
    id: 'test',
    name: { family: '山田', given: '太郎' },
    fielder: { contact: f, power: f, speed: f, arm: f, fielding: f, catching: f, eye: f, steal: f },
    wisdom: over.wisdom ?? 50,
    pitcher: {
      velocityKmh: over.kmh ?? 140,
      quick: over.quick ?? 25,
      control: over.control ?? 50,
      stamina: over.stamina ?? 80,
      pitches: ratings.map((rating, i) => ({ type: PITCH_TYPES[i]!, rating })),
    },
    traits: [],
  };
}

describe('総合力', () => {
  it('理論上の最大値は1500', () => {
    expect(OVERALL_MAX).toBe(1500);
  });

  it('全能力が上限の選手は1500', () => {
    const p = makePlayer({
      f: FIELDER_ABILITY_MAX,
      wisdom: WISDOM_MAX,
      kmh: VELOCITY_MAX_KMH,
      quick: QUICK_MAX,
      control: CONTROL_MAX,
      stamina: STAMINA_MAX,
      pitches: Array(5).fill(PITCH_RATING_MAX),
    });
    expect(calcOverall(p)).toBe(1500);
  });

  it('全能力が下限の選手（1球種・評価1）', () => {
    const p = makePlayer({
      f: FIELDER_ABILITY_MIN,
      wisdom: WISDOM_MIN,
      kmh: VELOCITY_MIN_KMH,
      quick: QUICK_MIN,
      control: CONTROL_MIN,
      stamina: STAMINA_MIN,
      pitches: [1],
    });
    // 野手8 + 賢さ1 + 球速1×3 + クイック1 + 球種1×3 + 制球1 + スタミナ30
    expect(calcOverall(p)).toBe(8 + 1 + 3 + 1 + 3 + 1 + 30);
  });

  it('野手8能力 + 賢さ + (km/h−120)×3 + クイック + 球種合計×3 + 制球 + スタミナ で計算される', () => {
    const p = makePlayer({ f: 50, wisdom: 40, kmh: 145, quick: 20, control: 60, stamina: 90, pitches: [12, 8, 5] });
    expect(calcOverall(p)).toBe(400 + 40 + 25 * 3 + 20 + 25 * 3 + 60 + 90);
  });
});
