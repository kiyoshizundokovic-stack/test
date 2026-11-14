/**
 * ストック（SPEC 7）のデータ型。機能の実装はフェーズ7b。保存形式を先に決めておく。
 * 通算成績は「保存する数値」だけを持ち、打率などの指標は計算で求める（計算値は保存しない）。
 */
import type { Player } from '../types';

/** 打者の通算成績の項目（保存する数値） */
export const BATTING_STAT_KEYS = [
  'games', // 試合数
  'pa', // 打席
  'ab', // 打数
  'h', // 安打
  'doubles', // 二塁打
  'triples', // 三塁打
  'hr', // 本塁打
  'rbi', // 打点
  'r', // 得点
  'bb', // 四球
  'k', // 三振
  'sbAttempts', // 盗塁企図
  'sb', // 盗塁成功
  'errors', // 失策
] as const;
export type BattingStatKey = (typeof BATTING_STAT_KEYS)[number];

/** 投手の通算成績の項目（保存する数値） */
export const PITCHING_STAT_KEYS = [
  'appearances', // 登板
  'outs', // 投球アウト数
  'pitches', // 球数
  'hits', // 被安打
  'hrAllowed', // 被本塁打
  'runs', // 失点
  'k', // 奪三振
  'bb', // 与四球
] as const;
export type PitchingStatKey = (typeof PITCHING_STAT_KEYS)[number];

export interface CareerStats {
  batting: Record<BattingStatKey, number>;
  pitching: Record<PitchingStatKey, number>;
  /** 参加したプレイの回数 */
  plays: number;
  /** 100戦完走の回数 */
  completions: number;
}

export function emptyCareer(): CareerStats {
  return {
    batting: Object.fromEntries(BATTING_STAT_KEYS.map((k) => [k, 0])) as Record<BattingStatKey, number>,
    pitching: Object.fromEntries(PITCHING_STAT_KEYS.map((k) => [k, 0])) as Record<PitchingStatKey, number>,
    plays: 0,
    completions: 0,
  };
}

export interface StockEntry {
  player: Player;
  favorite: boolean;
  /** ストックに入った日時（ISO 8601） */
  addedAt: string;
  career: CareerStats;
}

export interface StockData {
  entries: StockEntry[];
}

export function emptyStock(): StockData {
  return { entries: [] };
}
