import { describe, expect, it } from 'vitest';
import { BALANCE_TARGETS } from '../config';
import type { Player } from '../types';
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
  it('平均総合力500のチーム同士で、各指標が目標値付近に収まる', () => {
    const r = aggregate(runBalanceGames(11, 400, 500));
    for (const m of Object.keys(BALANCE_TARGETS) as BalanceMetric[]) {
      expect(r.metrics[m], m).toBeGreaterThanOrEqual(BALANCE_TARGETS[m].min - TOLERANCE[m]);
      expect(r.metrics[m], m).toBeLessThanOrEqual(BALANCE_TARGETS[m].max + TOLERANCE[m]);
    }
  });

  it('強さの段階が変わっても（同程度同士なら）成績が大きく変わらない', () => {
    const low = aggregate(runBalanceGames(12, 300, 500)).metrics;
    const high = aggregate(runBalanceGames(12, 300, 900)).metrics;
    expect(Math.abs(low.runs - high.runs)).toBeLessThan(0.6);
    expect(Math.abs(low.avg - high.avg)).toBeLessThan(0.015);
    expect(Math.abs(low.strikeoutRate - high.strikeoutRate)).toBeLessThan(0.03);
    expect(Math.abs(low.walkRate - high.walkRate)).toBeLessThan(0.02);
  });

  it('aggregate は打席記録から指標を計算する', () => {
    const games = runBalanceGames(13, 5, 500);
    const r = aggregate(games);
    const pas = games.flatMap((g) => g.events.flatMap((e) => (e.type === 'pa' ? [e.pa] : [])));
    const ks = pas.filter((p) => p.kind === 'K').length;
    expect(r.metrics.strikeoutRate).toBeCloseTo(ks / pas.length, 10);
    const runs = games.reduce((s, g) => s + g.score.away + g.score.home, 0);
    expect(r.metrics.runs).toBeCloseTo(runs / (games.length * 2), 10);
  });
});

describe('盗塁・エラーの検証（回帰テスト）', () => {
  it('全員「通常」の盗塁成功率は85〜90%程度', () => {
    const r = aggregate(runBalanceGames(21, 300, 500));
    const s = r.stealsByPolicy.normal;
    expect(s.attempts).toBeGreaterThan(200);
    expect(s.successes / s.attempts).toBeGreaterThan(0.83);
    expect(s.successes / s.attempts).toBeLessThan(0.92);
  });

  it('捕球・送球をそろえたチームのエラー数が能力帯ごとの目安に収まる', () => {
    const uniform = (v: number) => (players: Player[]) =>
      players.map((p) => ({ ...p, fielder: { ...p.fielder, catching: v, arm: v } }));
    const e30 = aggregate(runBalanceGames(22, 200, 500, { modifyRoster: uniform(30) })).extra.errors;
    const e50 = aggregate(runBalanceGames(22, 200, 500, { modifyRoster: uniform(50) })).extra.errors;
    const e80 = aggregate(runBalanceGames(22, 200, 500, { modifyRoster: uniform(80) })).extra.errors;
    expect(e30).toBeGreaterThan(0.9);
    expect(e30).toBeLessThan(1.7);
    expect(e50).toBeGreaterThan(0.35);
    expect(e50).toBeLessThan(0.7);
    expect(e80).toBeGreaterThan(0.06);
    expect(e80).toBeLessThan(0.28);
  });
});
