import { describe, expect, it } from 'vitest';
import { BALANCE_TARGETS } from '../config';
import { aggregate, runBalanceGames, type BalanceMetric } from './balance';

/** 試合数を減らしているので、目標範囲を少し広げて判定する */
const TOLERANCE: Record<BalanceMetric, number> = {
  runs: 0.25,
  avg: 0.008,
  homeRuns: 0.1,
  strikeoutRate: 0.01,
  walkRate: 0.008,
  pitches: 4,
};

describe('バランス（回帰テスト）', () => {
  it('平均総合力400のチーム同士で、各指標が目標値付近に収まる', () => {
    const r = aggregate(runBalanceGames(11, 400, 400));
    for (const m of Object.keys(BALANCE_TARGETS) as BalanceMetric[]) {
      expect(r.metrics[m], m).toBeGreaterThanOrEqual(BALANCE_TARGETS[m].min - TOLERANCE[m]);
      expect(r.metrics[m], m).toBeLessThanOrEqual(BALANCE_TARGETS[m].max + TOLERANCE[m]);
    }
  });

  it('強さの段階が変わっても（同程度同士なら）成績が大きく変わらない', () => {
    const low = aggregate(runBalanceGames(12, 300, 400)).metrics;
    const high = aggregate(runBalanceGames(12, 300, 670)).metrics;
    expect(Math.abs(low.runs - high.runs)).toBeLessThan(0.6);
    expect(Math.abs(low.avg - high.avg)).toBeLessThan(0.015);
    expect(Math.abs(low.strikeoutRate - high.strikeoutRate)).toBeLessThan(0.03);
    expect(Math.abs(low.walkRate - high.walkRate)).toBeLessThan(0.02);
  });

  it('aggregate は打席記録から指標を計算する', () => {
    const games = runBalanceGames(13, 5, 400);
    const r = aggregate(games);
    const pas = games.flatMap((g) => g.events.flatMap((e) => (e.type === 'pa' ? [e.pa] : [])));
    const ks = pas.filter((p) => p.kind === 'K').length;
    expect(r.metrics.strikeoutRate).toBeCloseTo(ks / pas.length, 10);
    const runs = games.reduce((s, g) => s + g.score.away + g.score.home, 0);
    expect(r.metrics.runs).toBeCloseTo(runs / (games.length * 2), 10);
  });
});
