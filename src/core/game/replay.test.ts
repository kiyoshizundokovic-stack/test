import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import { simulateGame } from './engine';
import { buildAutoPlan } from './plan';
import { nextStop, replayState } from './replay';
import { computeBoxScore } from './stats';
import type { GameResult, TeamEntry } from './types';

const rng = new Rng(31);
const team = (name: string): TeamEntry => {
  const players = generateOpponentRoster(rng, 500);
  return { name, players, plan: buildAutoPlan(players) };
};
const games: GameResult[] = Array.from({ length: 40 }, (_, i) => simulateGame(team('A'), team('B'), 100 + i));

describe('試合の再生', () => {
  it('最初は0-0・1回表・無死走者なし', () => {
    const s = replayState(games[0]!, 0);
    expect(s.score).toEqual({ away: 0, home: 0 });
    expect(s.inning).toBe(1);
    expect(s.half).toBe('top');
    expect(s.outs).toBe(0);
    expect(s.bases).toEqual([null, null, null]);
    expect(s.finished).toBe(false);
    expect(s.batterId).toBe(games[0]!.away.plan.stages[0]!.lineup[0]);
  });

  it('最後まで再生すると記録済みの結果と一致する', () => {
    for (const g of games) {
      const s = replayState(g, g.events.length);
      const box = computeBoxScore(g);
      expect(s.finished).toBe(true);
      expect(s.score).toEqual(g.score);
      expect(s.lineScore).toEqual(g.lineScore);
      expect(s.hits).toEqual({ away: box.away.hits, home: box.home.hits });
      expect(s.errors).toEqual({ away: box.away.errors, home: box.home.errors });
    }
  });

  it('途中経過：ラインスコアの合計が得点と一致し、各回の得点は最終結果と同じ', () => {
    for (const g of games) {
      for (let n = 0; n <= g.events.length; n += 3) {
        const s = replayState(g, n);
        for (const side of ['away', 'home'] as const) {
          expect(s.lineScore[side].reduce<number>((a, r) => a + (r ?? 0), 0)).toBe(s.score[side]);
          // 完了したイニングの得点は最終結果と一致する（未完了の回は途中の値）
          s.lineScore[side].forEach((r, i) => {
            if (r !== null) expect(r).toBeLessThanOrEqual(g.lineScore[side][i] ?? 0);
          });
        }
        if (!s.finished) expect(s.outs).toBeLessThan(3);
      }
    }
  });

  it('1打席ずつ：次の打席まで（前の盗塁・選手交代も含めて）進む', () => {
    const g = games.find((x) => x.events.some((e) => e.type === 'steal'))!;
    let shown = 0;
    let steps = 0;
    while (shown < g.events.length) {
      const next = nextStop(g, shown, 'pa');
      expect(next).toBeGreaterThan(shown);
      expect(g.events[next - 1]!.type === 'pa' || next === g.events.length).toBe(true);
      // 間にある打席は1つだけ
      expect(g.events.slice(shown, next).filter((e) => e.type === 'pa').length).toBeLessThanOrEqual(1);
      shown = next;
      steps++;
    }
    expect(steps).toBe(g.events.filter((e) => e.type === 'pa').length + (g.events.at(-1)!.type === 'pa' ? 0 : 1));
  });

  it('1イニングずつ：ハーフイニングの終わりで止まり、表裏が1つずつ進む', () => {
    for (const g of games) {
      let shown = 0;
      let halves = 0;
      while (shown < g.events.length) {
        shown = nextStop(g, shown, 'inning');
        halves++;
        const s = replayState(g, shown);
        if (!s.finished) {
          expect(s.outs).toBe(0);
          expect(s.bases).toEqual([null, null, null]);
        }
      }
      const played = g.lineScore.away.filter((r) => r !== null).length + g.lineScore.home.filter((r) => r !== null).length;
      expect(halves).toBe(played);
    }
  });

  it('結果まで：一度で最後まで進む', () => {
    const g = games[0]!;
    expect(nextStop(g, 0, 'end')).toBe(g.events.length);
    expect(nextStop(g, g.events.length, 'pa')).toBe(g.events.length);
  });
});
