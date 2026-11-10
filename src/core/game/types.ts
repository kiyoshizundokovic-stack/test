/** 試合関連のデータ型。すべて JSON シリアライズ可能に保つ（将来のペナント・セーブ用） */
import type { Player } from '../types';

export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABELS: Record<Position, string> = {
  P: '投手', C: '捕手', '1B': '一塁', '2B': '二塁', '3B': '三塁', SS: '遊撃', LF: '左翼', CF: '中堅', RF: '右翼',
};

export const OUTFIELD: readonly Position[] = ['LF', 'CF', 'RF'];
export const isOutfield = (p: Position) => OUTFIELD.includes(p);

/**
 * 継投の1段階。打順（9人、1番から）と9守備位置の配置を持つ。
 * - positions に配置された9人と lineup の9人は一致する
 * - 前の段階から残る選手は同じ打順のまま（打順は人に紐づく）
 * - 新しく入った選手は退いた選手の打順を引き継ぐ
 */
export interface Stage {
  lineup: string[];
  positions: Record<Position, string>;
}

/** 試合前の作戦。stages[0] が先発、以降は球数上限に達するごとに次の段階へ移る */
export interface GamePlan {
  stages: Stage[];
}

export interface TeamEntry {
  name: string;
  players: Player[];
  plan: GamePlan;
}

export type Half = 'top' | 'bottom';
export type BattedType = 'groundBall' | 'lineDrive' | 'flyBall';

/** 打席結果 */
export type PlayKind =
  | 'K' // 三振
  | 'BB' // 四球
  | '1B' | '2B' | '3B' | 'HR'
  | 'GO' // ゴロアウト
  | 'DP' // 併殺
  | 'FC' // 一塁走者封殺・打者は一塁へ
  | 'LO' // ライナーアウト
  | 'FO' // フライアウト
  | 'SF'; // 犠牲フライ

/** 走者の動き。to: 1〜3 = 塁、4 = 生還、0 = アウト */
export interface RunnerMove {
  runnerId: string;
  from: 0 | 1 | 2 | 3; // 0 = 打者
  to: 0 | 1 | 2 | 3 | 4;
}

/** 1打席の構造化された記録 */
export interface PlateAppearance {
  inning: number;
  half: Half;
  battingSlot: number; // 0〜8
  batterId: string;
  pitcherId: string;
  outsBefore: number;
  basesBefore: (string | null)[];
  kind: PlayKind;
  battedType?: BattedType;
  /** 打球が飛んだゾーン（本塁打は 'HR'） */
  zone?: Position | 'HR';
  fielderId?: string;
  pitches: number;
  moves: RunnerMove[];
  runs: number;
  rbi: number;
  /** 失点の責任投手（生還した走者ごと） */
  runsChargedTo: string[];
  outsAfter: number;
  basesAfter: (string | null)[];
  scoreAfter: { away: number; home: number };
}

/** 段階の移行（投手交代・守備変更） */
export interface StageChange {
  inning: number;
  half: Half;
  team: 'away' | 'home';
  stageIndex: number;
  /** 退いた選手 → 入った選手（同じ打順） */
  substitutions: { slot: number; outId: string; inId: string }[];
  /** 守備位置の変更（新規出場を含む） */
  positionChanges: { playerId: string; from: Position | null; to: Position }[];
}

export type GameEvent = { type: 'pa'; pa: PlateAppearance } | { type: 'stage'; change: StageChange };

export interface GameResult {
  seed: number;
  away: TeamEntry;
  home: TeamEntry;
  events: GameEvent[];
  /** イニングごとの得点。行われなかった9回裏は null */
  lineScore: { away: (number | null)[]; home: (number | null)[] };
  score: { away: number; home: number };
  winner: 'away' | 'home' | 'draw';
  walkOff: boolean;
}
