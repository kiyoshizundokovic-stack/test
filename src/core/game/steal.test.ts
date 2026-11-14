import { describe, expect, it } from 'vitest';
import { STEAL } from '../config';
import { generatePlayers } from '../generate';
import { Rng } from '../rng';
import type { Player } from '../types';
import { buildAutoPlan } from './plan';
import { setStealPolicy } from './planEdit';
import type { Bases, Runner } from './runners';
import { decideSteal, executeSteal, stealSuccessProbability, stealThreshold } from './steal';

const [runner0, pitcher0, catcher0, other0] = generatePlayers(new Rng(1), 4) as [Player, Player, Player, Player];
const withRunner = (steal: number, speed: number, wisdom: number): Player => ({
  ...runner0,
  fielder: { ...runner0.fielder, steal, speed },
  wisdom,
});
const battery = (quick: number, kmh: number, arm: number, wisdom: number): [Player, Player] => [
  { ...pitcher0, wisdom, pitcher: { ...pitcher0.pitcher, quick, velocityKmh: kmh } },
  { ...catcher0, wisdom, fielder: { ...catcher0.fielder, arm } },
];

describe('盗塁', () => {
  const [p, c] = battery(17, 137, 33, 33);

  it('成功率は走者の盗塁・走力・賢さで上がり、投手のクイック・球速、捕手の送球で下がる', () => {
    const base = stealSuccessProbability(withRunner(50, 50, 33), 2, p, c);
    expect(stealSuccessProbability(withRunner(80, 50, 33), 2, p, c)).toBeGreaterThan(base);
    expect(stealSuccessProbability(withRunner(50, 80, 33), 2, p, c)).toBeGreaterThan(base);
    expect(stealSuccessProbability(withRunner(50, 50, 80), 2, p, c)).toBeGreaterThan(base);
    const [fastP, armC] = battery(45, 160, 90, 33);
    expect(stealSuccessProbability(withRunner(50, 50, 33), 2, fastP, c)).toBeLessThan(base);
    expect(stealSuccessProbability(withRunner(50, 50, 33), 2, p, armC)).toBeLessThan(base);
  });

  it('守備側の賢さは投手と捕手の高い方を使う（走者の賢さと1:1）', () => {
    const r = withRunner(50, 50, 50);
    const [p1, c1] = battery(17, 137, 33, 30);
    const smartCatcher = { ...c1, wisdom: 70 };
    const smartPitcher = { ...p1, wisdom: 70 };
    expect(stealSuccessProbability(r, 2, p1, smartCatcher)).toBeCloseTo(stealSuccessProbability(r, 2, smartPitcher, c1), 10);
    // 走者と守備側の賢さが同じだけ上がれば成功率は変わらない
    const even = stealSuccessProbability(withRunner(50, 50, 40), 2, ...battery(17, 137, 33, 40));
    const evenHigh = stealSuccessProbability(withRunner(50, 50, 80), 2, ...battery(17, 137, 33, 80));
    expect(evenHigh).toBeCloseTo(even, 10);
  });

  it('難易度は 二盗 < 三盗 < 本盗。本盗は極めて難しい', () => {
    const r = withRunner(50, 50, 40);
    const second = stealSuccessProbability(r, 2, p, c);
    const third = stealSuccessProbability(r, 3, p, c);
    const home = stealSuccessProbability(r, 4, p, c);
    expect(second).toBeGreaterThan(third);
    expect(third).toBeGreaterThan(home);
    expect(home).toBeLessThanOrEqual(STEAL.homeMax);
    // 一流の走者でも、平均的なバッテリーには本盗を企図しない（二盗はほぼ確実に成功する走者でも）
    const elite = withRunner(90, 90, 60);
    expect(stealSuccessProbability(elite, 2, p, c)).toBeGreaterThan(0.95);
    expect(stealSuccessProbability(elite, 4, p, c)).toBeLessThan(STEAL.threshold.aggressive);
  });

  it('企図の判断：見込み成功率（実際の判定と同じ式）が積極度のしきい値以上なら企図する', () => {
    expect(stealThreshold('none')).toBeNull();
    expect(stealThreshold('normal')).toBe(0.8);
    expect(stealThreshold('aggressive')).toBe(0.7);

    const players = [withRunner(35, 40, 33), other0, ...generatePlayers(new Rng(2), 8)];
    const runner = players[0]!;
    const plan = buildAutoPlan(players.slice(0, 9));
    const bases: Bases = [{ id: runner.id, pitcherId: 'x' }, null, null];
    const playerOf = (id: string) => players.find((x) => x.id === id)!;
    const expected = stealSuccessProbability(runner, 2, p, c);
    expect(expected).toBeGreaterThanOrEqual(0.7);
    expect(expected).toBeLessThan(0.8);

    expect(decideSteal(bases, plan, p, c, playerOf)).toBeNull(); // 通常：80%未満なので企図しない
    const aggressive = setStealPolicy(plan, runner.id, 'aggressive');
    const decided = decideSteal(bases, aggressive, p, c, playerOf);
    expect(decided?.to).toBe(2);
    expect(decided?.expected).toBeCloseTo(expected, 10);
    expect(decideSteal(bases, setStealPolicy(plan, runner.id, 'none'), p, c, playerOf)).toBeNull();
    // 次の塁が埋まっていれば企図しない
    const blocked: Bases = [{ id: runner.id, pitcherId: 'x' }, { id: other0.id, pitcherId: 'x' }, null];
    const d2 = decideSteal(blocked, setStealPolicy(aggressive, other0.id, 'none'), p, c, playerOf);
    expect(d2).toBeNull();
  });

  it('実際の成功率は見込み成功率に一致する（エラーで少し上振れする程度）', () => {
    const r = withRunner(55, 55, 33);
    const runner: Runner = { id: r.id, pitcherId: p.id };
    const expected = stealSuccessProbability(r, 2, p, c);
    const stage = { lineup: [], positions: { P: p.id, C: c.id, '1B': other0.id, '2B': other0.id, '3B': other0.id, SS: other0.id, LF: other0.id, CF: other0.id, RF: other0.id } };
    const playerOf = (id: string) => [p, c, other0, r].find((x) => x.id === id)!;
    const rng = new Rng(9);
    let success = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const out = executeSteal(rng, { runner, from: 1, to: 2, policy: 'normal', expected }, { bases: [runner, null, null], outs: 0 }, stage, playerOf);
      if (out.success) {
        success++;
        expect(out.bases[1]?.id ?? out.bases[2]?.id).toBe(r.id);
      } else {
        expect(out.outs).toBe(1);
        expect(out.bases).toEqual([null, null, null]);
      }
    }
    expect(success / n).toBeGreaterThan(expected - 0.02);
    expect(success / n).toBeLessThan(expected + 0.04);
  });
});
