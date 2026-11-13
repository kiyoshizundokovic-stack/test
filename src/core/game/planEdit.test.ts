import { describe, expect, it } from 'vitest';
import { generatePlayers } from '../generate';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import { buildAutoPlan, validatePlan } from './plan';
import {
  addStage,
  assignPosition,
  canPlaceInStage,
  entrantsOf,
  moveBattingSlot,
  playersOnField,
  removeStage,
  setEntrantSlot,
  setStealPolicy,
  swapBattingSlots,
} from './planEdit';
import { stealPolicyOf } from './steal';
import type { GamePlan } from './types';

const players = generateOpponentRoster(new Rng(21), 400); // 12人
const base = buildAutoPlan(players); // 先発 + 継投3
const benchOf = (plan: GamePlan, stage: number) =>
  players.filter((p) => !playersOnField(plan.stages[stage]!).includes(p.id) && !plan.stages.some((s) => playersOnField(s).includes(p.id)));

describe('作戦の編集', () => {
  it('打順の入れ替えは全段階に適用され、作戦は有効なまま', () => {
    const plan = swapBattingSlots(base, 0, 3);
    expect(plan.stages[0]!.lineup[0]).toBe(base.stages[0]!.lineup[3]);
    expect(plan.stages[0]!.lineup[3]).toBe(base.stages[0]!.lineup[0]);
    expect(validatePlan(plan, players)).toEqual([]);
    // 投手の打順に入った継投投手も一緒に動く
    const pSlot = base.stages[0]!.lineup.indexOf(base.stages[0]!.positions.P);
    const moved = moveBattingSlot(base, pSlot, 0);
    for (const s of moved.stages) expect(s.lineup[0]).toBe(s.positions.P);
    expect(validatePlan(moved, players)).toEqual([]);
  });

  it('同じ段階にいる選手を別の守備位置に置くと2人の守備位置が入れ替わり、以降の段階にも反映される', () => {
    const s0 = base.stages[0]!;
    const plan = assignPosition(base, 0, 'SS', s0.positions['2B']);
    expect(plan.stages[0]!.positions.SS).toBe(s0.positions['2B']);
    expect(plan.stages[0]!.positions['2B']).toBe(s0.positions.SS);
    for (const s of plan.stages) {
      expect(s.positions.SS).toBe(s0.positions['2B']);
      expect(s.positions['2B']).toBe(s0.positions.SS);
    }
    expect(plan.stages[0]!.lineup).toEqual(s0.lineup); // 打順は変わらない
    expect(validatePlan(plan, players)).toEqual([]);
  });

  it('控えを守備に入れると、退いた選手の打順を引き継ぐ', () => {
    // 継投を1段階にして控えを作る
    const plan1: GamePlan = { stages: [base.stages[0]!] };
    const bench = benchOf(plan1, 0)[0]!;
    const out = plan1.stages[0]!.positions.LF;
    const slot = plan1.stages[0]!.lineup.indexOf(out);
    const plan = assignPosition(plan1, 0, 'LF', bench.id);
    expect(plan.stages[0]!.lineup[slot]).toBe(bench.id);
    expect(validatePlan(plan, players)).toEqual([]);
  });

  it('継投段階で野手も交代でき、複数人が入れ替わるときは引き継ぐ打順を指定できる', () => {
    let plan: GamePlan = { stages: [base.stages[0]!] };
    plan = addStage(plan, players); // 控えの投手が入る
    expect(plan.stages[1]!.positions.P).not.toBe(plan.stages[0]!.positions.P);
    expect(validatePlan(plan, players)).toEqual([]);

    // さらに左翼も控えと交代
    const bench = benchOf(plan, 1)[0]!;
    const lfOut = plan.stages[1]!.positions.LF;
    plan = assignPosition(plan, 1, 'LF', bench.id);
    expect(validatePlan(plan, players)).toEqual([]);
    const { entrants, vacatedSlots } = entrantsOf(plan, 1);
    expect(entrants).toHaveLength(2);
    expect(vacatedSlots).toHaveLength(2);
    expect(plan.stages[1]!.lineup[plan.stages[0]!.lineup.indexOf(lfOut)]).toBe(bench.id);

    // 新しい投手と左翼手の打順を入れ替える
    const pitcher = plan.stages[1]!.positions.P;
    const other = vacatedSlots.find((s) => plan.stages[1]!.lineup[s] !== pitcher)!;
    const swapped = setEntrantSlot(plan, 1, pitcher, other);
    expect(swapped.stages[1]!.lineup[other]).toBe(pitcher);
    expect(validatePlan(swapped, players)).toEqual([]);

    // 前の段階から続けて出場する選手の打順は指定できない
    const stay = plan.stages[1]!.positions.C;
    expect(setEntrantSlot(plan, 1, stay, other)).toBe(plan);
  });

  it('控えがいない（9人）場合も、野手と投手の守備位置を入れ替えて継投できる', () => {
    const nine = generatePlayers(new Rng(3), 9);
    let plan = buildAutoPlan(nine);
    plan = addStage(plan, nine);
    // 控えがいないので配置は前の段階のまま → 投手が同じなのでエラー
    expect(validatePlan(plan, nine).some((e) => e.includes('投手が前の段階と同じ'))).toBe(true);
    const ss = plan.stages[1]!.positions.SS;
    plan = assignPosition(plan, 1, 'P', ss); // 遊撃手が登板、元の投手が遊撃へ
    expect(validatePlan(plan, nine)).toEqual([]);
    expect(plan.stages[1]!.lineup).toEqual(plan.stages[0]!.lineup);
  });

  it('退いた選手は以降の段階に配置できない（再出場禁止）', () => {
    const starter = base.stages[0]!.positions.P;
    expect(canPlaceInStage(base, 1, starter)).toBe(true); // 2番手の段階なら戻せる（交代の取り消し）
    expect(canPlaceInStage(base, 2, starter)).toBe(false);
    expect(canPlaceInStage(base, 3, starter)).toBe(false);
    // 無理に配置するとバリデーションで検出される
    const bad = assignPosition(base, 2, 'LF', starter);
    expect(validatePlan(bad, players).some((e) => e.includes('再出場'))).toBe(true);
  });

  it('段階の削除で打順が整合し直される', () => {
    const plan = removeStage(base, 1);
    expect(plan.stages).toHaveLength(3);
    expect(validatePlan(plan, players)).toEqual([]);
    expect(removeStage(base, 0)).toBe(base);
  });

  it('盗塁の積極度：初期値は通常、設定しても他の編集で失われない', () => {
    const id = base.stages[0]!.lineup[0]!;
    expect(stealPolicyOf(base, id)).toBe('normal');
    let plan = setStealPolicy(base, id, 'aggressive');
    expect(stealPolicyOf(plan, id)).toBe('aggressive');
    plan = swapBattingSlots(plan, 0, 1);
    plan = assignPosition(plan, 0, 'SS', plan.stages[0]!.positions['2B']);
    plan = addStage(plan, players);
    expect(stealPolicyOf(plan, id)).toBe('aggressive');
    plan = setStealPolicy(plan, id, 'none');
    expect(stealPolicyOf(plan, id)).toBe('none');
    plan = setStealPolicy(plan, id, 'normal');
    expect(plan.stealPolicy).toBeUndefined(); // 通常は既定値なので記録しない
  });

  it('編集操作は元の作戦を変更しない', () => {
    const snapshot = JSON.stringify(base);
    swapBattingSlots(base, 0, 1);
    assignPosition(base, 0, 'C', base.stages[0]!.positions.SS);
    addStage(base, players);
    removeStage(base, 2);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
