/**
 * 走者処理表（SPEC 3.2 ステップ3）。ロジックから分離したデータとして定義する。
 * - batter: 打者の行き先（0=アウト, 1〜3=塁, 4=生還）
 * - runners: 既存走者の基本の行き先。'force' は押し出しのみ、'stay' は動かない、
 *   オブジェクトは元の塁 → 行き先（0=アウト）
 * - extras: 基本の進塁の後、さらに先の塁を狙う試み（先の走者から順に判定）。
 *   attempt はアウトカウント（0,1,2）別の試行確率。risky=true なら成否を走力vs送球で判定し、失敗はアウト。
 *   kind は成功率の式（config の RUNNING.advance / tagUp）
 *
 * 規則：打者・封殺によるアウトで3アウトになった場合、走者の進塁・得点は無効（runnerTable の外の共通処理）。
 */

export type Base = 1 | 2 | 3;
export type Dest = 0 | 1 | 2 | 3 | 4;

export interface ExtraAdvance {
  from: Base;
  to: 2 | 3 | 4;
  attempt: readonly [number, number, number];
  risky: boolean;
  kind: 'advance' | 'tagUp';
}

export interface RunnerRule {
  batter: Dest;
  runners: 'force' | 'stay' | Partial<Record<Base, Dest>>;
  extras?: readonly ExtraAdvance[];
}

export type RuleKey =
  | 'K' | 'BB' | 'HR' | '3B' | '2B' | '1B' | '1B_IF'
  | 'GO' | 'DP' | 'FC' | 'LO' | 'FO' | 'FO_IF';

export const RUNNER_TABLE: Record<RuleKey, RunnerRule> = {
  K: { batter: 0, runners: 'stay' },
  LO: { batter: 0, runners: 'stay' },
  FO_IF: { batter: 0, runners: 'stay' },
  BB: { batter: 1, runners: 'force' },
  HR: { batter: 4, runners: { 1: 4, 2: 4, 3: 4 } },
  '3B': { batter: 3, runners: { 1: 4, 2: 4, 3: 4 } },
  '2B': {
    batter: 2,
    runners: { 1: 3, 2: 4, 3: 4 },
    extras: [{ from: 1, to: 4, attempt: [0.35, 0.4, 0.65], risky: true, kind: 'advance' }],
  },
  '1B': {
    batter: 1,
    runners: { 1: 2, 2: 3, 3: 4 },
    extras: [
      { from: 2, to: 4, attempt: [0.55, 0.6, 0.9], risky: true, kind: 'advance' },
      { from: 1, to: 3, attempt: [0.25, 0.25, 0.35], risky: true, kind: 'advance' },
    ],
  },
  /** 内野安打：押し出しのみ */
  '1B_IF': { batter: 1, runners: 'force' },
  /** ゴロアウト（一塁走者なし、または二死。一塁走者ありで二死未満は DP / FC） */
  GO: {
    batter: 0,
    runners: 'stay',
    extras: [
      { from: 3, to: 4, attempt: [0.5, 0.5, 0], risky: true, kind: 'advance' },
      { from: 2, to: 3, attempt: [0.6, 0.6, 0], risky: false, kind: 'advance' },
    ],
  },
  /** 併殺：打者と一塁走者がアウト、他の走者は1つ進む */
  DP: { batter: 0, runners: { 1: 0, 2: 3, 3: 4 } },
  /** 併殺崩れ（一塁走者封殺、打者は一塁へ） */
  FC: { batter: 1, runners: { 1: 0, 2: 3, 3: 4 } },
  /** 外野フライアウト：タッチアップ */
  FO: {
    batter: 0,
    runners: 'stay',
    extras: [
      { from: 3, to: 4, attempt: [0.9, 0.9, 0], risky: true, kind: 'tagUp' },
      { from: 2, to: 3, attempt: [0.3, 0.3, 0], risky: true, kind: 'tagUp' },
    ],
  },
};
