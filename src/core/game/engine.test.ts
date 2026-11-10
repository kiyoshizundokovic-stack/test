import { describe, expect, it } from 'vitest';
import { GAME_INNINGS } from '../config';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import { simulateGame } from './engine';
import { buildAutoPlan, validatePlan } from './plan';
import { computeBoxScore } from './stats';
import type { GameResult, PlateAppearance, TeamEntry } from './types';

function makeTeam(rng: Rng, name: string, target = 400): TeamEntry {
  const players = generateOpponentRoster(rng, target);
  return { name, players, plan: buildAutoPlan(players) };
}

function makeGames(count: number, seed = 1): GameResult[] {
  const rng = new Rng(seed);
  return Array.from({ length: count }, () =>
    simulateGame(makeTeam(rng, 'A'), makeTeam(rng, 'B'), rng.int(0, 1e9)),
  );
}

const pas = (g: GameResult): PlateAppearance[] =>
  g.events.flatMap((e) => (e.type === 'pa' ? [e.pa] : []));

describe('試合エンジン', () => {
  it('同じシード・同じ入力なら同じ結果になる', () => {
    const rng = new Rng(5);
    const a = makeTeam(rng, 'A');
    const b = makeTeam(rng, 'B');
    expect(simulateGame(a, b, 123)).toEqual(simulateGame(a, b, 123));
    expect(simulateGame(a, b, 123).events).not.toEqual(simulateGame(a, b, 124).events);
  });

  const games = makeGames(300);

  it('延長なし：9回で終わり、得点の合計がスコアと一致する', () => {
    for (const g of games) {
      expect(g.lineScore.away).toHaveLength(GAME_INNINGS);
      expect(g.lineScore.home).toHaveLength(GAME_INNINGS);
      for (const side of ['away', 'home'] as const) {
        const sum = g.lineScore[side].reduce<number>((s, r) => s + (r ?? 0), 0);
        expect(sum).toBe(g.score[side]);
        const fromPA = pas(g)
          .filter((p) => (p.half === 'top') === (side === 'away'))
          .reduce((s, p) => s + p.runs, 0);
        expect(fromPA).toBe(g.score[side]);
      }
      const expected = g.score.away > g.score.home ? 'away' : g.score.home > g.score.away ? 'home' : 'draw';
      expect(g.winner).toBe(expected);
    }
  });

  it('引き分けが発生しうる', () => {
    expect(games.some((g) => g.winner === 'draw')).toBe(true);
  });

  it('9回裏は後攻がリードしていれば行わない', () => {
    for (const g of games) {
      if (g.lineScore.home[GAME_INNINGS - 1] === null) {
        const top9 = g.score.home > g.score.away;
        expect(top9).toBe(true);
        expect(pas(g).some((p) => p.inning === GAME_INNINGS && p.half === 'bottom')).toBe(false);
      }
    }
    expect(games.some((g) => g.lineScore.home[GAME_INNINGS - 1] === null)).toBe(true);
  });

  it('サヨナラは成立した打席で終了し、本塁打以外は勝ち越し1点まで', () => {
    const walkOffs = games.filter((g) => g.walkOff);
    expect(walkOffs.length).toBeGreaterThan(0);
    for (const g of walkOffs) {
      const last = pas(g).at(-1)!;
      expect(last.inning).toBe(GAME_INNINGS);
      expect(last.half).toBe('bottom');
      expect(g.winner).toBe('home');
      if (last.kind !== 'HR') expect(g.score.home - g.score.away).toBe(1);
    }
  });

  it('各ハーフイニングは3アウトで終わり、走者状況が打席間で連続している', () => {
    for (const g of games) {
      const list = pas(g);
      for (let i = 0; i < list.length; i++) {
        const pa = list[i]!;
        const next = list[i + 1];
        expect(pa.outsAfter).toBeGreaterThanOrEqual(pa.outsBefore);
        expect(pa.outsAfter).toBeLessThanOrEqual(3);
        if (next && next.inning === pa.inning && next.half === pa.half) {
          expect(pa.outsAfter).toBeLessThan(3);
          expect(next.outsBefore).toBe(pa.outsAfter);
          expect(next.basesBefore).toEqual(pa.basesAfter);
        } else if (!(g.walkOff && i === list.length - 1)) {
          expect(pa.outsAfter).toBe(3);
        }
        if (pa.outsBefore === 0 && (i === 0 || list[i - 1]!.half !== pa.half || list[i - 1]!.inning !== pa.inning)) {
          expect(pa.basesBefore).toEqual([null, null, null]);
        }
      }
    }
  });

  it('打順は1〜9番を順に回り、イニングをまたいで引き継がれる', () => {
    for (const g of games) {
      for (const half of ['top', 'bottom'] as const) {
        const slots = pas(g).filter((p) => p.half === half).map((p) => p.battingSlot);
        slots.forEach((s, i) => expect(s).toBe(i % 9));
      }
    }
  });

  it('球数がスタミナに達したら次の段階の投手に交代し、最後の投手は続投する', () => {
    let changes = 0;
    for (const g of games) {
      for (const side of ['away', 'home'] as const) {
        const team = g[side];
        const stamina = new Map(team.players.map((p) => [p.id, p.pitcher.stamina]));
        const pitchers = team.plan.stages.map((s) => s.positions.P);
        const defending = pas(g).filter((p) => (p.half === 'top') === (side === 'home'));
        const thrown = new Map<string, number>();
        let stage = 0;
        for (const pa of defending) {
          while (stage < pitchers.length - 1 && (thrown.get(pitchers[stage]!) ?? 0) >= stamina.get(pitchers[stage]!)!) {
            stage++;
            changes++;
          }
          expect(pa.pitcherId).toBe(pitchers[stage]);
          thrown.set(pa.pitcherId, (thrown.get(pa.pitcherId) ?? 0) + pa.pitches);
        }
      }
    }
    expect(changes).toBeGreaterThan(0);
  });

  it('成績：打数・安打・投球回が打席記録と整合する', () => {
    for (const g of games.slice(0, 50)) {
      const box = computeBoxScore(g);
      for (const side of ['away', 'home'] as const) {
        const def = side === 'away' ? 'home' : 'away';
        const outs = box[def].pitching.reduce((s, p) => s + p.outs, 0);
        const halfInnings = pas(g).filter((p) => (p.half === 'top') === (side === 'away'));
        expect(outs).toBe(halfInnings.reduce((s, p) => s + p.outsAfter - p.outsBefore, 0));
        const runsAllowed = box[def].pitching.reduce((s, p) => s + p.r, 0);
        expect(runsAllowed).toBe(g.score[side]);
        const runs = box[side].batting.reduce((s, b) => s + b.r, 0);
        expect(runs).toBe(g.score[side]);
      }
    }
  });

  it('不正な作戦では試合を開始しない', () => {
    const rng = new Rng(2);
    const a = makeTeam(rng, 'A');
    const b = makeTeam(rng, 'B');
    const broken: TeamEntry = { ...a, plan: { stages: [{ ...a.plan.stages[0]!, lineup: a.plan.stages[0]!.lineup.slice(0, 8) }] } };
    expect(() => simulateGame(broken, b, 1)).toThrow();
    expect(validatePlan(a.plan, a.players)).toEqual([]);
  });
});
