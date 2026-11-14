import { describe, expect, it } from 'vitest';
import { generatePlayers } from '../generate';
import { Rng } from '../rng';
import type { Player } from '../types';
import {
  catchSteps,
  doublePlaySteps,
  errorProbability,
  forceAtSecondSteps,
  groundOutSteps,
  runFieldingChain,
  stealThrowSteps,
  throwSteps,
} from './fielding';
import { applyPlay, type Bases, type Runner } from './runners';
import { POSITIONS, type Position, type Stage } from './types';

const base = generatePlayers(new Rng(1), 1)[0]!;
const withSkill = (catching: number, arm: number, wisdom = 33): Player => ({
  ...base,
  fielder: { ...base.fielder, catching, arm },
  wisdom,
});

describe('エラー判定', () => {
  it('捕球は捕球、送球は送球の能力が大きく効き、賢さは小さく効く', () => {
    const avg = errorProbability('groundBall', withSkill(50, 50));
    expect(errorProbability('groundBall', withSkill(80, 50))).toBeLessThan(avg);
    expect(errorProbability('groundBall', withSkill(50, 80))).toBeCloseTo(avg, 10); // 送球は捕球の動作に無関係
    expect(errorProbability('throw', withSkill(50, 80))).toBeLessThan(errorProbability('throw', withSkill(50, 50)));
    const smart = errorProbability('groundBall', withSkill(50, 50, 80));
    expect(smart).toBeLessThan(avg);
    // 賢さの影響は捕球の影響より小さい
    expect(avg / smart).toBeLessThan(avg / errorProbability('groundBall', withSkill(97, 50)));
  });

  it('打球ごとの動作の連鎖', () => {
    expect(catchSteps('flyBall', 'CF')).toEqual([{ position: 'CF', kind: 'flyBall' }]);
    expect(groundOutSteps('SS').map((s) => `${s.position}:${s.kind}`)).toEqual(['SS:groundBall', 'SS:throw', '1B:receive']);
    expect(groundOutSteps('1B').map((s) => `${s.position}:${s.kind}`)).toEqual(['1B:groundBall']);
    expect(forceAtSecondSteps('2B').map((s) => `${s.position}:${s.kind}`)).toEqual(['2B:groundBall', '2B:throw', 'SS:receive']);
    // 遊撃→二塁→一塁の併殺：遊撃の捕球・送球、二塁の捕球・送球、一塁の捕球
    expect(doublePlaySteps('SS').map((s) => `${s.position}:${s.kind}`)).toEqual([
      'SS:groundBall', 'SS:throw', '2B:receive', '2B:throw', '1B:receive',
    ]);
    expect(throwSteps('RF', 4).map((s) => `${s.position}:${s.kind}`)).toEqual(['RF:throw', 'C:receive']);
    expect(stealThrowSteps(2).map((s) => s.position)).toEqual(['C', '2B']);
    expect(stealThrowSteps(3).map((s) => s.position)).toEqual(['C', '3B']);
    expect(stealThrowSteps(4).map((s) => s.position)).toEqual(['P', 'C']);
  });

  it('連鎖は最初のエラーで止まり、誰のどの動作かを記録する', () => {
    const terrible = withSkill(1, 1, 1);
    const perfect = withSkill(100, 100, 100);
    const ids = Object.fromEntries(POSITIONS.map((p) => [p, `id-${p}`])) as Record<Position, string>;
    const stage: Stage = { lineup: [], positions: ids };
    // 二塁手だけが下手
    const playerOf = (id: string) => (id === 'id-2B' ? { ...terrible, id } : { ...perfect, id });
    let byWeak = 0;
    let byOthers = 0;
    const rng = new Rng(3);
    for (let i = 0; i < 2000; i++) {
      const r = runFieldingChain(rng, doublePlaySteps('SS'), stage, playerOf);
      if (!r) continue;
      expect(r.error.playerId).toBe(stage.positions[r.error.position]);
      if (r.error.playerId === 'id-2B') {
        byWeak++;
        expect(['receive', 'throw']).toContain(r.error.action); // 二塁手は「送球の捕球」と「送球」を担当
        expect([2, 3]).toContain(r.index);
      } else byOthers++;
    }
    expect(byWeak).toBeGreaterThan(50);
    expect(byWeak).toBeGreaterThan(byOthers * 10);
  });
});

describe('エラー時の走者処理', () => {
  const ps = generatePlayers(new Rng(5), 5);
  const byId = new Map(ps.map((p) => [p.id, p]));
  const R = (i: number): Runner => ({ id: ps[i]!.id, pitcherId: 'pit' });
  const batter = R(0);
  const play = (key: Parameters<typeof applyPlay>[1], bases: Bases, outs: number) =>
    applyPlay(new Rng(1), key, { bases, outs }, batter, ps[4]!, (id) => byId.get(id)!);

  it('打球処理のエラー：打者は出塁し、走者は1つ先へ（三塁走者は生還）', () => {
    const r = play('E', [R(1), null, R(3)], 2);
    expect(r.outs).toBe(2);
    expect(r.bases.map((x) => x?.id ?? null)).toEqual([batter.id, R(1).id, null]);
    expect(r.scored.map((x) => x.id)).toEqual([R(3).id]);
  });

  it('二塁封殺を狙ったエラー：一塁走者は二塁セーフのうえ1つ先（三塁）、打者は一塁', () => {
    const r = play('FC_E', [R(1), null, null], 0);
    expect(r.outs).toBe(0);
    expect(r.bases.map((x) => x?.id ?? null)).toEqual([batter.id, null, R(1).id]);
  });

  it('併殺の一塁送球のエラー：二塁封殺は成立、打者は一塁、他の走者は1つ先', () => {
    const r = play('DP_E2', [R(1), R(2), null], 0);
    expect(r.outs).toBe(1);
    expect(r.bases.map((x) => x?.id ?? null)).toEqual([batter.id, null, null]);
    expect(r.scored.map((x) => x.id)).toEqual([R(2).id]);
  });

  it('走者を刺す送球のエラー：走者はセーフになり、塁上の全走者がさらに1つ進む', () => {
    // 単打で二塁走者が本塁を狙う → 本塁送球がエラー → 打者走者も二塁へ
    let seen = false;
    for (let seed = 0; seed < 50 && !seen; seed++) {
      const r = applyPlay(new Rng(seed), '1B', { bases: [null, R(2), null], outs: 0 }, batter, ps[4]!, (id) => byId.get(id)!, (to) =>
        to === 4 ? { playerId: 'c', position: 'C', action: 'receive' } : null,
      );
      if (r.errors.length > 0) {
        seen = true;
        expect(r.scored.map((x) => x.id)).toEqual([R(2).id]);
        expect(r.bases[1]?.id).toBe(batter.id);
        expect(r.outs).toBe(0);
      }
    }
    expect(seen).toBe(true);
  });
});
