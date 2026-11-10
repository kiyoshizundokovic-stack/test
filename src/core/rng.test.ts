import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('同じシードなら同じ乱数列になる', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('状態を保存・復元すると続きから同じ乱数列になる', () => {
    const a = new Rng(7);
    a.next();
    const saved = a.getState();
    const expected = [a.next(), a.next(), a.next()];
    const b = new Rng(0);
    b.setState(saved);
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });

  it('int は両端を含む範囲に収まる', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.int(1, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });
});
