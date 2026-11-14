/**
 * 通算成績（SPEC 7.3）。保存するのは数値（打撃・投球の各項目）だけで、打率などの指標は計算で求める。
 * - collectGameStats：1試合の構造化記録から、自チームの選手ごとの成績を集計する（再戦も同じ）
 * - STAT_DEFINITIONS：表示・ソートに使う指標の一覧。指標を増やすときはここに追加するだけでよい
 */
import { OUTS_PER_INNING } from '../config';
import { formatInnings } from '../game/stats';
import type { GameResult } from '../game/types';
import { BATTING_STAT_KEYS, PITCHING_STAT_KEYS, type BattingStatKey, type CareerStats, type PitchingStatKey } from './types';

/** 1試合・1プレイ分の成績（通算成績からプレイ回数・完走回数を除いたもの） */
export interface PlayStats {
  batting: Record<BattingStatKey, number>;
  pitching: Record<PitchingStatKey, number>;
}

export function emptyPlayStats(): PlayStats {
  return {
    batting: Object.fromEntries(BATTING_STAT_KEYS.map((k) => [k, 0])) as Record<BattingStatKey, number>,
    pitching: Object.fromEntries(PITCHING_STAT_KEYS.map((k) => [k, 0])) as Record<PitchingStatKey, number>,
  };
}

export function addPlayStats<T extends PlayStats>(base: T, add: PlayStats): T {
  const out = { ...base, batting: { ...base.batting }, pitching: { ...base.pitching } };
  for (const k of BATTING_STAT_KEYS) out.batting[k] += add.batting[k] ?? 0;
  for (const k of PITCHING_STAT_KEYS) out.pitching[k] += add.pitching[k] ?? 0;
  return out;
}

/** 選手ごとの成績表（ID → 成績）を足し合わせる */
export function mergeStatsTable(base: Record<string, PlayStats>, add: Record<string, PlayStats>): Record<string, PlayStats> {
  const out: Record<string, PlayStats> = { ...base };
  for (const [id, s] of Object.entries(add)) out[id] = addPlayStats(out[id] ?? emptyPlayStats(), s);
  return out;
}

/**
 * 1試合の記録から、side（自チームが先攻か後攻か）の選手ごとの成績を集計する。
 * - 試合数：打順に入った（先発、または継投の段階で出場した）試合
 * - 登板：投手として打者に投げた（または盗塁の場面でマウンドにいた）試合
 * - 失策：自チームの守備の記録（打席・盗塁）から
 */
export function collectGameStats(game: GameResult, side: 'away' | 'home'): Record<string, PlayStats> {
  const team = game[side];
  const ids = new Set(team.players.map((p) => p.id));
  const myHalf = side === 'away' ? 'top' : 'bottom';
  const table: Record<string, PlayStats> = {};
  const of = (id: string) => (table[id] ??= emptyPlayStats());
  const appeared = new Set<string>(team.plan.stages[0]!.lineup);
  const pitched = new Set<string>();

  for (const ev of game.events) {
    if (ev.type === 'stage') {
      if (ev.change.team === side) for (const sub of ev.change.substitutions) appeared.add(sub.inId);
      continue;
    }
    const play = ev.type === 'pa' ? ev.pa : ev.steal;
    if (play.half === myHalf) {
      // 攻撃：打撃・走塁
      if (ev.type === 'pa') {
        const pa = ev.pa;
        const b = of(pa.batterId).batting;
        b.pa++;
        if (pa.kind !== 'BB' && pa.kind !== 'SF') b.ab++;
        if (pa.kind === '1B' || pa.kind === '2B' || pa.kind === '3B' || pa.kind === 'HR') b.h++;
        if (pa.kind === '2B') b.doubles++;
        if (pa.kind === '3B') b.triples++;
        if (pa.kind === 'HR') b.hr++;
        if (pa.kind === 'BB') b.bb++;
        if (pa.kind === 'K') b.k++;
        b.rbi += pa.rbi;
      } else {
        const b = of(ev.steal.runnerId).batting;
        b.sbAttempts++;
        if (ev.steal.success) b.sb++;
      }
      const scored = play.moves.filter((m) => m.to === 4).map((m) => m.runnerId).slice(0, play.runs);
      for (const id of scored) if (ids.has(id)) of(id).batting.r++;
    } else {
      // 守備：投球・失策
      const pitcherId = play.pitcherId;
      if (ids.has(pitcherId)) {
        pitched.add(pitcherId);
        const p = of(pitcherId).pitching;
        p.outs += Math.min(OUTS_PER_INNING, play.outsAfter) - play.outsBefore;
        if (ev.type === 'pa') {
          const pa = ev.pa;
          p.pitches += pa.pitches;
          if (pa.kind === '1B' || pa.kind === '2B' || pa.kind === '3B' || pa.kind === 'HR') p.hits++;
          if (pa.kind === 'HR') p.hrAllowed++;
          if (pa.kind === 'K') p.k++;
          if (pa.kind === 'BB') p.bb++;
        }
      }
      for (const charged of play.runsChargedTo) if (ids.has(charged)) of(charged).pitching.runs++;
      for (const err of play.errors) if (ids.has(err.playerId)) of(err.playerId).batting.errors++;
    }
  }
  for (const id of appeared) of(id).batting.games++;
  for (const id of pitched) of(id).pitching.appearances++;
  return table;
}

// ---------------------------------------------------------------------------
// 指標（保存した値から計算する。計算値は保存しない）
// ---------------------------------------------------------------------------

export interface StatDefinition {
  key: string;
  label: string;
  group: 'batting' | 'pitching' | 'other';
  /** 値（計算できないときは null） */
  value: (c: CareerStats) => number | null;
  format: (v: number) => string;
  /** 小さいほど良い指標（ソートの既定の向きに使う） */
  lowerIsBetter?: boolean;
}

const rate3 = (v: number) => (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''));
const int = (v: number) => String(Math.round(v));
const dec2 = (v: number) => v.toFixed(2);
const div = (a: number, b: number) => (b > 0 ? a / b : null);
const totalBases = (c: CareerStats) => {
  const b = c.batting;
  return b.h + b.doubles + 2 * b.triples + 3 * b.hr;
};
const obp = (c: CareerStats) => div(c.batting.h + c.batting.bb, c.batting.pa);
const slg = (c: CareerStats) => div(totalBases(c), c.batting.ab);

export const STAT_DEFINITIONS: readonly StatDefinition[] = [
  { key: 'games', label: '試合', group: 'batting', value: (c) => c.batting.games, format: int },
  { key: 'pa', label: '打席', group: 'batting', value: (c) => c.batting.pa, format: int },
  { key: 'avg', label: '打率', group: 'batting', value: (c) => div(c.batting.h, c.batting.ab), format: rate3 },
  { key: 'obp', label: '出塁率', group: 'batting', value: obp, format: rate3 },
  { key: 'slg', label: '長打率', group: 'batting', value: slg, format: rate3 },
  {
    key: 'ops',
    label: 'OPS',
    group: 'batting',
    value: (c) => {
      const a = obp(c);
      const b = slg(c);
      return a === null || b === null ? null : a + b;
    },
    format: rate3,
  },
  { key: 'h', label: '安打', group: 'batting', value: (c) => c.batting.h, format: int },
  { key: 'hr', label: '本塁打', group: 'batting', value: (c) => c.batting.hr, format: int },
  { key: 'rbi', label: '打点', group: 'batting', value: (c) => c.batting.rbi, format: int },
  { key: 'r', label: '得点', group: 'batting', value: (c) => c.batting.r, format: int },
  { key: 'sb', label: '盗塁', group: 'batting', value: (c) => c.batting.sb, format: int },
  { key: 'sbRate', label: '盗塁成功率', group: 'batting', value: (c) => div(c.batting.sb, c.batting.sbAttempts), format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'errors', label: '失策', group: 'batting', value: (c) => c.batting.errors, format: int, lowerIsBetter: true },
  { key: 'appearances', label: '登板', group: 'pitching', value: (c) => c.pitching.appearances, format: int },
  { key: 'innings', label: '投球回', group: 'pitching', value: (c) => c.pitching.outs, format: (v) => formatInnings(v) },
  {
    key: 'runRate',
    label: '失点率',
    group: 'pitching',
    value: (c) => div(c.pitching.runs * 27, c.pitching.outs),
    format: dec2,
    lowerIsBetter: true,
  },
  { key: 'kRate', label: '奪三振率', group: 'pitching', value: (c) => div(c.pitching.k * 27, c.pitching.outs), format: dec2 },
  { key: 'bbRate', label: '与四球率', group: 'pitching', value: (c) => div(c.pitching.bb * 27, c.pitching.outs), format: dec2, lowerIsBetter: true },
  { key: 'pk', label: '奪三振', group: 'pitching', value: (c) => c.pitching.k, format: int },
  { key: 'plays', label: 'プレイ', group: 'other', value: (c) => c.plays, format: int },
  { key: 'completions', label: '完走', group: 'other', value: (c) => c.completions, format: int },
];

export function statDefinition(key: string): StatDefinition | undefined {
  return STAT_DEFINITIONS.find((d) => d.key === key);
}

/** 指標の表示文字列（計算できなければ「-」） */
export function formatStat(def: StatDefinition, c: CareerStats): string {
  const v = def.value(c);
  return v === null ? '-' : def.format(v);
}
