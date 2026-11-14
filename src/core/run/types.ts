/** ローグライク進行（SPEC 5）のデータ型。すべて JSON シリアライズ可能（フェーズ7でそのまま保存する） */
import type { GamePlan, GameResult } from '../game/types';
import type { Player } from '../types';

/**
 * 進行状況
 * - strategy：試合前（ホーム・選手一覧・作戦設定）
 * - game：試合を計算済みで、試合画面で再生中（結果はすでに反映済み）
 * - result：試合結果。勝利時はここで補強（獲得・売却・ライフ購入）を行う
 * - bossReward：ボス戦勝利後の特別報酬（強化する選手を選ぶ）
 * - gameover：ライフ0で終了
 * - finished：100戦を終えて終了
 */
export type RunStatus = 'strategy' | 'game' | 'result' | 'bossReward' | 'gameover' | 'finished';

export type Outcome = 'win' | 'loss' | 'draw';

export interface GameSummary {
  gameNumber: number;
  boss: boolean;
  opponentAverage: number;
  side: 'away' | 'home';
  score: { mine: number; opponent: number };
  outcome: Outcome;
  pointsGained: number;
}

/** 直近の試合（再生・結果画面・補強で使う） */
export interface CurrentGame {
  gameNumber: number;
  boss: boolean;
  /** 相手の総合力の平均目標（段階で決まる値） */
  targetAverage: number;
  /** 相手選手の総合力の実際の平均（勝利ポイントの計算に使う） */
  opponentAverage: number;
  opponent: Player[];
  side: 'away' | 'home';
  game: GameResult;
  outcome: Outcome;
  pointsGained: number;
  /** 補強フェーズで相手から選手を獲得したか（1人まで） */
  acquired: boolean;
}

export interface RunState {
  version: 1;
  seed: number;
  /** PRNGの状態（相手の生成・試合・ボス報酬はすべてここから引く） */
  rngState: number;
  status: RunStatus;
  /** 次に行う試合の番号（1〜100）。試合後の画面では直近の試合の番号 */
  gameNumber: number;
  life: number;
  points: number;
  roster: Player[];
  /** 作戦（前回の作戦を次の試合のデフォルトとして引き継ぐ） */
  plan: GamePlan;
  /** 選手の増減で作戦を自動修正したときの内容（UIで確認を促す） */
  planNotes: string[];
  record: { wins: number; losses: number; draws: number };
  history: GameSummary[];
  current: CurrentGame | null;
  /** ボス報酬の結果（直近） */
  lastBossReward?: { playerId: string; changes: string[] };
}
