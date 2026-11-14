/** ローグライク進行（SPEC 5）のデータ型。すべて JSON シリアライズ可能（フェーズ7でそのまま保存する） */
import type { GamePlan, GameResult } from '../game/types';
import type { PlayStats } from '../stock/career';
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

/**
 * 次の試合の相手（試合前に生成しておく。試合前の画面で相手の情報を見られるようにするため）。
 * 再戦（SPEC 5.6）では、直前の試合の相手（選手・打順・守備配置・継投）をそのまま使う
 */
export interface OpponentSetup {
  gameNumber: number;
  boss: boolean;
  /** 同じ相手との再戦か */
  rematch: boolean;
  targetAverage: number;
  opponentName: string;
  opponent: Player[];
  opponentPlan: GamePlan;
}

/** 補強フェーズの状態（売却の取り消し・やり直し用） */
export interface ReinforceState {
  /** 補強フェーズを開始したとき（勝利ポイント加算後）の状態 */
  start: { roster: Player[]; points: number; life: number };
  /** このフェーズで売却した選手と売却額（取り戻すときは同じポイントを支払う） */
  sold: { player: Player; price: number }[];
}

export interface GameSummary {
  gameNumber: number;
  boss: boolean;
  /** 同じ相手との再戦（敗北後のリベンジ・引き分け後の再戦）。試合数には数えない */
  rematch: boolean;
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
  /** 再戦だったか */
  rematch: boolean;
  opponentName: string;
  /** 相手の作戦（再戦ではこれをそのまま使う） */
  opponentPlan: GamePlan;
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
  /** 補強フェーズの状態（勝利したときのみ。それ以外は null） */
  reinforce: ReinforceState | null;
}

export interface RunState {
  /** 進行中のプレイの形式のバージョン（save/format.ts の SAVE_VERSION と同じ） */
  version: 4;
  /** プレイID（UUID）。選手IDの接頭辞になる */
  runId: string;
  /** 次に生成する選手の通し番号（選手ID＝プレイID＋通し番号） */
  nextSerial: number;
  /** ストックから連れて行った選手のID（売却不可・ボス報酬対象外） */
  stockPlayerIds: string[];
  /** このプレイでの自チームの選手ごとの成績（再戦を含む）。ゲーム終了時にストックの通算成績に加算する */
  playStats: Record<string, PlayStats>;
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
  /** 次の試合の相手（試合前の状態で用意されている。ゲーム終了後は null） */
  next: OpponentSetup | null;
  /** ボス報酬の結果（直近） */
  lastBossReward?: { playerId: string; changes: string[] };
}
