import { describe, expect, it } from 'vitest';
import { FIELDING, INITIAL_ROSTER_SIZE, INITIAL_STAMINA_GUARANTEE } from './config';
import { outProbability } from './game/plate';
import { generatePlayers } from './generate';
import { calcOverall } from './overall';
import { Rng } from './rng';
import { createRun } from './run/run';
import type { Player } from './types';

describe('自チームの初期選手の球数保証（仕様変更3）', () => {
  it('自動生成の9人のうち少なくとも1人は球数100以上', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createRun(seed);
      const generated = s.roster.slice(0, INITIAL_ROSTER_SIZE);
      expect(Math.max(...generated.map((p) => p.pitcher.stamina))).toBeGreaterThanOrEqual(INITIAL_STAMINA_GUARANTEE.minStamina);
    }
  });

  it('総合力の分布（平均500・±200程度）は変わらない', () => {
    const all: number[] = [];
    const guaranteed: number[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const roster = createRun(seed).roster;
      all.push(...roster.map(calcOverall));
      guaranteed.push(calcOverall(roster[0]!));
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(all)).toBeGreaterThan(485);
    expect(mean(all)).toBeLessThan(515);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...all)).toBeLessThanOrEqual(700);
    // 球数を保証した選手も、総合力は他の選手と同じ決め方
    expect(mean(guaranteed)).toBeGreaterThan(470);
    expect(mean(guaranteed)).toBeLessThan(530);
  });

  it('ストックから連れて行った選手は対象外（能力はそのまま）', () => {
    const picks = generatePlayers(new Rng(5), 3).map((p) => ({ ...p, pitcher: { ...p.pitcher, stamina: 40 } }));
    const s = createRun(1, 'stamina-run', picks);
    for (const p of picks) expect(s.roster.find((x) => x.id === p.id)!.pitcher.stamina).toBe(40);
    expect(Math.max(...s.roster.slice(0, INITIAL_ROSTER_SIZE).map((p) => p.pitcher.stamina))).toBeGreaterThanOrEqual(100);
  });
});

describe('守備者の走力（守備範囲・仕様変更3）', () => {
  const base = generatePlayers(new Rng(9), 2);
  const batter = base[0]!;
  const fielderWith = (speed: number, fielding = 50): Player => ({ ...base[1]!, fielder: { ...base[1]!.fielder, speed, fielding } });

  it('走力が高いほどアウトになりやすい（ゴロ・ライナー・外野フライ）', () => {
    for (const [type, zone] of [
      ['groundBall', 'SS'],
      ['lineDrive', 'SS'],
      ['lineDrive', 'CF'],
      ['flyBall', 'CF'],
    ] as const) {
      expect(outProbability(type, zone, batter, fielderWith(80))).toBeGreaterThan(outProbability(type, zone, batter, fielderWith(20)));
    }
    // 内野フライには使わない
    expect(outProbability('flyBall', 'SS', batter, fielderWith(80))).toBe(outProbability('flyBall', 'SS', batter, fielderWith(20)));
  });

  it('影響は外野で大きく内野で小さく、どちらも守備力より小さい', () => {
    const gain = (type: 'groundBall' | 'lineDrive' | 'flyBall', zone: 'SS' | 'CF', f: (v: number) => Player) =>
      outProbability(type, zone, batter, f(80)) - outProbability(type, zone, batter, f(20));
    const bySpeed = (v: number) => fielderWith(v);
    const byFielding = (v: number) => fielderWith(50, v);
    expect(gain('lineDrive', 'CF', bySpeed)).toBeGreaterThan(gain('lineDrive', 'SS', bySpeed));
    expect(gain('flyBall', 'CF', bySpeed)).toBeGreaterThan(gain('groundBall', 'SS', bySpeed));
    for (const [type, zone] of [
      ['groundBall', 'SS'],
      ['lineDrive', 'SS'],
      ['lineDrive', 'CF'],
      ['flyBall', 'CF'],
    ] as const) {
      expect(gain(type, zone, bySpeed)).toBeLessThan(gain(type, zone, byFielding));
    }
    expect(FIELDING.outfieldFly.fielderSpeed).toBeLessThan(FIELDING.outfieldFly.fielding);
    expect(FIELDING.groundBall.fielderSpeed).toBeLessThan(FIELDING.groundBall.fielding);
  });
});
