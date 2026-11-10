import { describe, expect, it } from 'vitest';
import { generatePlayers } from '../generate';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import { buildAutoPlan, validatePlan } from './plan';
import { POSITIONS, type GamePlan } from './types';

describe('作戦AI・バリデーション', () => {
  it('相手AIの作戦：先発スタミナ100以上、控え3人が順に登板、投手以外の守備は変えない', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 50; i++) {
      const players = generateOpponentRoster(rng, 400);
      const plan = buildAutoPlan(players);
      expect(validatePlan(plan, players)).toEqual([]);
      expect(plan.stages).toHaveLength(4);
      const starter = players.find((p) => p.id === plan.stages[0]!.positions.P)!;
      expect(starter.pitcher.stamina).toBeGreaterThanOrEqual(100);
      for (let s = 1; s < plan.stages.length; s++) {
        const prev = plan.stages[s - 1]!;
        const cur = plan.stages[s]!;
        for (const pos of POSITIONS) if (pos !== 'P') expect(cur.positions[pos]).toBe(prev.positions[pos]);
        const slot = prev.lineup.indexOf(prev.positions.P);
        expect(cur.lineup[slot]).toBe(cur.positions.P);
      }
    }
  });

  it('9人ならば継投なし（1段階）', () => {
    const players = generatePlayers(new Rng(1), 9);
    const plan = buildAutoPlan(players);
    expect(plan.stages).toHaveLength(1);
    expect(validatePlan(plan, players)).toEqual([]);
  });

  it('再出場・打順の入れ替えを検出する', () => {
    const players = generateOpponentRoster(new Rng(4), 400);
    const plan = buildAutoPlan(players);
    const [s0, s1] = plan.stages as [GamePlan['stages'][0], GamePlan['stages'][0]];

    // 段階3で、段階2で退いた先発投手を戻す
    const reentry: GamePlan = { stages: [s0, s1, { lineup: s0.lineup, positions: s0.positions }] };
    expect(validatePlan(reentry, players).some((e) => e.includes('再出場'))).toBe(true);

    // 継続出場の選手の打順を入れ替える
    const swapped = [...s1.lineup];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const reorder: GamePlan = { stages: [s0, { lineup: swapped, positions: s1.positions }] };
    expect(validatePlan(reorder, players).some((e) => e.includes('打順が変わって'))).toBe(true);

    // 守備位置の重複
    const dup: GamePlan = { stages: [{ lineup: s0.lineup, positions: { ...s0.positions, C: s0.positions.SS } }] };
    expect(validatePlan(dup, players)).not.toEqual([]);
  });
});
