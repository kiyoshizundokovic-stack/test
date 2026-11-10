import { describe, expect, it } from 'vitest';
import {
  CONTROL_MAX,
  CONTROL_MIN,
  FIELDER_ABILITY_MAX,
  FIELDER_ABILITY_MIN,
  OVERALL_MAX,
  PITCH_RATING_MAX,
  STAMINA_MAX,
  STAMINA_MIN,
  VELOCITY_MAX_KMH,
  VELOCITY_MIN_KMH,
} from './config';
import { calcOverall } from './overall';
import { PITCH_TYPES, type Player } from './types';

function makePlayer(over: Partial<{ f: number; kmh: number; control: number; stamina: number; pitches: number[] }>): Player {
  const f = over.f ?? 50;
  const ratings = over.pitches ?? [10];
  return {
    id: 'test',
    name: { family: '山田', given: '太郎' },
    fielder: { contact: f, power: f, speed: f, arm: f, fielding: f, catching: f },
    pitcher: {
      velocityKmh: over.kmh ?? 140,
      control: over.control ?? 50,
      stamina: over.stamina ?? 80,
      pitches: ratings.map((rating, i) => ({ type: PITCH_TYPES[i]!, rating })),
    },
    traits: [],
  };
}

describe('総合力', () => {
  it('理論上の最大値は1000', () => {
    expect(OVERALL_MAX).toBe(1000);
  });

  it('全能力が上限の選手は1000', () => {
    const p = makePlayer({
      f: FIELDER_ABILITY_MAX,
      kmh: VELOCITY_MAX_KMH,
      control: CONTROL_MAX,
      stamina: STAMINA_MAX,
      pitches: Array(5).fill(PITCH_RATING_MAX),
    });
    expect(calcOverall(p)).toBe(1000);
  });

  it('全能力が下限の選手（1球種・評価1）', () => {
    const p = makePlayer({ f: FIELDER_ABILITY_MIN, kmh: VELOCITY_MIN_KMH, control: CONTROL_MIN, stamina: STAMINA_MIN, pitches: [1] });
    // 野手6 + 球速1 + 制球1 + スタミナ30 + 球種1
    expect(calcOverall(p)).toBe(6 + 1 + 1 + 30 + 1);
  });

  it('野手6能力 + (km/h−120) + 制球 + スタミナ + 球種合計 で計算される', () => {
    const p = makePlayer({ f: 50, kmh: 145, control: 60, stamina: 90, pitches: [12, 8, 5] });
    expect(calcOverall(p)).toBe(300 + 25 + 60 + 90 + 25);
  });
});
