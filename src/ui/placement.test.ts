import { describe, expect, it } from 'vitest';
import { buildAutoPlan, generateOpponentRoster, Rng } from '../core';
import { placementText } from './PitcherTable';

describe('投手の一覧表：現在の配置の表示', () => {
  const players = generateOpponentRoster(new Rng(3), 500);
  const plan = buildAutoPlan(players); // 先発＋継投3段階。投手以外は全段階で同じ位置
  const s = plan.stages;
  it('全段階で同じ位置なら「全段階」とまとめる', () => {
    expect(placementText(plan, s[0]!.positions.C)).toBe('全段階:捕');
  });
  it('継投の投手は登板する段階だけ表示し、控えは「控え」', () => {
    expect(placementText(plan, s[0]!.positions.P)).toBe('先発:投');
    expect(placementText(plan, s[2]!.positions.P)).toBe('3番手:投');
    expect(placementText({ stages: [s[0]!] }, s[1]!.positions.P)).toBe('控え');
  });
});
