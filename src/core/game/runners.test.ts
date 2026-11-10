import { describe, expect, it } from 'vitest';
import { generatePlayers } from '../generate';
import { Rng } from '../rng';
import { applyPlay, type Bases, type Runner } from './runners';
import type { RuleKey } from './runnerTable';

const players = generatePlayers(new Rng(1), 5);
const byId = new Map(players.map((p) => [p.id, p]));
const playerOf = (id: string) => byId.get(id)!;
const R = (i: number): Runner => ({ id: players[i]!.id, pitcherId: 'pit' });
const batter = R(0);
const thrower = players[4]!;

function play(key: RuleKey, bases: Bases, outs: number, seed = 1) {
  return applyPlay(new Rng(seed), key, { bases, outs }, batter, thrower, playerOf);
}

describe('走者処理', () => {
  it('四球：満塁なら押し出し1点、一三塁なら三塁走者は動かない', () => {
    const loaded = play('BB', [R(1), R(2), R(3)], 0);
    expect(loaded.scored.map((r) => r.id)).toEqual([R(3).id]);
    expect(loaded.bases.map((r) => r?.id)).toEqual([batter.id, R(1).id, R(2).id]);
    const corners = play('BB', [R(1), null, R(3)], 1);
    expect(corners.scored).toHaveLength(0);
    expect(corners.bases.map((r) => r?.id)).toEqual([batter.id, R(1).id, R(3).id]);
  });

  it('本塁打：走者全員と打者が生還', () => {
    const r = play('HR', [R(1), R(2), null], 2);
    expect(r.scored).toHaveLength(3);
    expect(r.bases).toEqual([null, null, null]);
    expect(r.outs).toBe(2);
  });

  it('併殺：一死一塁なら3アウトで得点なし。無死一三塁なら三塁走者は生還', () => {
    const r = play('DP', [R(1), null, R(3)], 1);
    expect(r.outs).toBe(3);
    expect(r.scored).toHaveLength(0);
    const r0 = play('DP', [R(1), null, R(3)], 0);
    expect(r0.outs).toBe(2);
    expect(r0.scored.map((x) => x.id)).toEqual([R(3).id]);
  });

  it('二死からのゴロアウト・フライアウトでは得点が入らない', () => {
    for (const key of ['GO', 'FO', 'K', 'LO'] as const) {
      const r = play(key, [null, R(2), R(3)], 2);
      expect(r.outs).toBe(3);
      expect(r.scored).toHaveLength(0);
    }
  });

  it('外野フライで三塁走者がタッチアップを試みる（成功・失敗のいずれか）', () => {
    let scored = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = play('FO', [null, null, R(3)], 0, seed);
      if (r.scored.length === 1) scored++;
      // 成功なら1アウト1点、失敗なら2アウト0点、試みなければ1アウト0点
      expect([1, 2]).toContain(r.outs);
      if (r.outs === 2) expect(r.scored).toHaveLength(0);
    }
    expect(scored).toBeGreaterThan(100);
  });

  it('一死からの外野フライでもタッチアップを試みる（犠牲フライが成立する）', () => {
    let scored = 0;
    for (let seed = 0; seed < 100; seed++) {
      const r = play('FO', [null, null, R(3)], 1, seed);
      if (r.scored.length === 1) {
        scored++;
        expect(r.outs).toBe(2);
      }
    }
    expect(scored).toBeGreaterThan(50);
  });

  it('二塁打：二・三塁走者は生還し、打者は二塁', () => {
    const r = play('2B', [null, R(2), R(3)], 0);
    expect(r.scored).toHaveLength(2);
    expect(r.bases[1]?.id).toBe(batter.id);
  });

  it('同じ塁に2人いる状態にならない', () => {
    const keys: RuleKey[] = ['1B', '1B_IF', '2B', '3B', 'GO', 'FC', 'FO', 'BB'];
    for (let seed = 0; seed < 300; seed++) {
      const rng = new Rng(seed);
      const bases: Bases = [rng.next() < 0.5 ? R(1) : null, rng.next() < 0.5 ? R(2) : null, rng.next() < 0.5 ? R(3) : null];
      const key = rng.pick(keys);
      const r = play(key, bases, rng.int(0, 1), seed);
      const ids = r.bases.filter(Boolean).map((x) => x!.id);
      expect(new Set(ids).size).toBe(ids.length);
      const before = bases.filter(Boolean).length + 1;
      // 人数保存：塁上 + 生還 + アウト = 元の走者 + 打者
      const outCount = r.moves.filter((m) => m.to === 0).length;
      expect(ids.length + r.scored.length + outCount).toBe(before);
    }
  });
});
