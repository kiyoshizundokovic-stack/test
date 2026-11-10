import { describe, expect, it } from 'vitest';
import {
  CONTROL_MAX,
  CONTROL_MIN,
  FIELDER_ABILITY_MAX,
  FIELDER_ABILITY_MIN,
  STAMINA_MAX,
  STAMINA_MIN,
  VELOCITY_MAX_KMH,
  VELOCITY_MIN_KMH,
} from './config';
import { generatePlayer, generatePlayers } from './generate';
import { fullName } from './names';
import { calcOverall } from './overall';
import { validatePitches } from './pitches';
import { Rng } from './rng';
import { FIELDER_ABILITY_KEYS } from './types';

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe('選手生成', () => {
  const players = generatePlayers(new Rng(2024), 2000);

  it('全能力が範囲内に収まる', () => {
    for (const p of players) {
      for (const k of FIELDER_ABILITY_KEYS) {
        expect(p.fielder[k]).toBeGreaterThanOrEqual(FIELDER_ABILITY_MIN);
        expect(p.fielder[k]).toBeLessThanOrEqual(FIELDER_ABILITY_MAX);
        expect(Number.isInteger(p.fielder[k])).toBe(true);
      }
      expect(p.pitcher.velocityKmh).toBeGreaterThanOrEqual(VELOCITY_MIN_KMH);
      expect(p.pitcher.velocityKmh).toBeLessThanOrEqual(VELOCITY_MAX_KMH);
      expect(p.pitcher.control).toBeGreaterThanOrEqual(CONTROL_MIN);
      expect(p.pitcher.control).toBeLessThanOrEqual(CONTROL_MAX);
      expect(p.pitcher.stamina).toBeGreaterThanOrEqual(STAMINA_MIN);
      expect(p.pitcher.stamina).toBeLessThanOrEqual(STAMINA_MAX);
      expect(validatePitches(p.pitcher.pitches)).toEqual([]);
      expect(p.traits).toEqual([]);
    }
  });

  it('初期選手の総合力は平均400程度で、ばらつきがある', () => {
    const overalls = players.map(calcOverall);
    expect(mean(overalls)).toBeGreaterThan(385);
    expect(mean(overalls)).toBeLessThan(415);
    expect(sd(overalls)).toBeGreaterThan(25);
    expect(Math.max(...overalls) - Math.min(...overalls)).toBeGreaterThan(150);
  });

  it('球速・スタミナ・球種もそれぞれ上限の4割前後が中心', () => {
    const vel = mean(players.map((p) => p.pitcher.velocityKmh - 120)); // 上限50
    const sta = mean(players.map((p) => p.pitcher.stamina)); // 上限150
    const pit = mean(players.map((p) => p.pitcher.pitches.reduce((s, x) => s + x.rating, 0))); // 上限100
    expect(vel / 50).toBeGreaterThan(0.3);
    expect(vel / 50).toBeLessThan(0.5);
    expect(sta / 150).toBeGreaterThan(0.3);
    expect(sta / 150).toBeLessThan(0.5);
    expect(pit / 100).toBeGreaterThan(0.3);
    expect(pit / 100).toBeLessThan(0.5);
  });

  it('目標総合力を指定するとその付近になる（相手チーム用）', () => {
    const strong = generatePlayers(new Rng(5), 1000, { targetOverall: 700 }).map(calcOverall);
    expect(mean(strong)).toBeGreaterThan(680);
    expect(mean(strong)).toBeLessThan(720);
  });

  it('タイプによって個性が出る（投手型は投手能力、強打型はミート・パワーが高い）', () => {
    const pitchers = generatePlayers(new Rng(3), 300, { archetype: 'pitcher' });
    const sluggers = generatePlayers(new Rng(3), 300, { archetype: 'slugger' });
    const ctrl = (ps: typeof pitchers) => mean(ps.map((p) => p.pitcher.control));
    const pow = (ps: typeof pitchers) => mean(ps.map((p) => p.fielder.power));
    expect(ctrl(pitchers)).toBeGreaterThan(ctrl(sluggers) + 15);
    expect(pow(sluggers)).toBeGreaterThan(pow(pitchers) + 15);
  });

  it('minStamina を指定するとスタミナが保証される', () => {
    for (const p of generatePlayers(new Rng(8), 300, { minStamina: 100 })) {
      expect(p.pitcher.stamina).toBeGreaterThanOrEqual(100);
    }
  });

  it('同じシードなら同じ選手が生成される', () => {
    expect(generatePlayers(new Rng(77), 9)).toEqual(generatePlayers(new Rng(77), 9));
    expect(generatePlayers(new Rng(77), 9)).not.toEqual(generatePlayers(new Rng(78), 9));
  });

  it('チーム内で名前とIDが重複しない', () => {
    const team = generatePlayers(new Rng(11), 12);
    expect(new Set(team.map((p) => fullName(p.name))).size).toBe(12);
    expect(new Set(team.map((p) => p.id)).size).toBe(12);
  });

  it('単体生成でも名前は姓・名リストから組み立てられる', () => {
    const p = generatePlayer(new Rng(1));
    expect(p.name.family.length).toBeGreaterThan(0);
    expect(p.name.given.length).toBeGreaterThan(0);
  });
});
