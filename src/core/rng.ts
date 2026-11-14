/**
 * シード付き疑似乱数生成器（mulberry32）。
 * 状態は32bit整数1つなので、getState()/setState() でセーブデータに保存・復元できる。
 * Math.random() はゲームロジックで使用しないこと。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 文字列シードから生成（FNV-1a ハッシュ） */
  static fromString(seed: string): Rng {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return new Rng(h >>> 0);
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** [0, 1) の一様乱数 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] の整数（両端含む） */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [min, max) の実数 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 正規分布（Box-Muller） */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** 配列から1要素を選ぶ */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** 重み付きで1要素を選ぶ */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    const total = items.reduce((s, it) => s + weightOf(it), 0);
    if (items.length === 0 || total <= 0) throw new Error('Rng.weighted: no positive weights');
    let r = this.next() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return items[items.length - 1] as T;
  }

  /** 新しい配列としてシャッフル（Fisher-Yates） */
  shuffle<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
}
