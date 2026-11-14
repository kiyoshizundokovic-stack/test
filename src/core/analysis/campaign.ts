/**
 * 繰り返しプレイ（ストックを持ち越しながら何度もプレイする）のシミュレーション（SPEC 5.7・フェーズ7c。分析専用）。
 * 1回のプレイは sim.ts の simulateRun（run.ts と同じ結果になることをテスト済み）を使い、
 * プレイの合間にストックを更新する：
 * - ニューゲーム：ストックから総合力の高い順に最大 picks 人を連れて行く
 * - ゲーム終了：連れて行った選手は戻り、それ以外の保有選手のうち総合力の高い選手をストックに加える
 *   （ストックは上限まで。上限を超えたら総合力の低い選手から外す＝ボットが削除する）
 */
import { STOCK } from '../config';
import { calcOverall } from '../overall';
import type { Player } from '../types';
import { DEFAULT_RULES, simulateRun, type Bot, type RunRules } from './sim';

export interface CampaignBot {
  run: Bot;
  /** ニューゲームでストックから連れて行く人数（最大 STOCK.pickMax） */
  picks: number;
}

export interface PlayRecord {
  reached: number;
  finished: boolean;
  /** 連れて行った選手の総合力の平均（いなければ0） */
  pickAverage: number;
  /** 終了時の保有選手の総合力の平均 */
  finalAverage: number;
  livesBought: number;
}

export interface CampaignOutcome {
  plays: PlayRecord[];
  /** 初めて100戦を完走したプレイの回数（1始まり。完走しなければ null） */
  firstCompletion: number | null;
}

/** プレイごとのシード（キャンペーンのシードとプレイ番号から決める） */
export function playSeed(campaignSeed: number, play: number): number {
  return (Math.imul(campaignSeed + 1, 1000003) + Math.imul(play + 1, 7919)) >>> 0;
}

export function simulateCampaign(seed: number, bot: CampaignBot, rules: RunRules = DEFAULT_RULES, maxPlays = 40): CampaignOutcome {
  let stock: Player[] = [];
  const plays: PlayRecord[] = [];
  const byOverall = (a: Player, b: Player) => calcOverall(b) - calcOverall(a);
  for (let i = 0; i < maxPlays; i++) {
    const picks = [...stock].sort(byOverall).slice(0, Math.min(bot.picks, STOCK.pickMax));
    const out = simulateRun(playSeed(seed, i), bot.run, rules, picks, `c${seed}-p${i}`);
    plays.push({
      reached: out.reached,
      finished: out.finished,
      pickAverage: picks.length ? picks.reduce((s, p) => s + calcOverall(p), 0) / picks.length : 0,
      finalAverage: out.finalAverage,
      livesBought: out.livesBought,
    });
    if (out.finished) return { plays, firstCompletion: i + 1 };
    // ゲーム終了：連れて行った選手はそのまま戻る（能力は変わらない）。それ以外の保有選手を候補に加え、上限まで残す
    const pickIds = new Set(picks.map((p) => p.id));
    const candidates = out.finalRoster.filter((p) => !pickIds.has(p.id));
    stock = [...stock, ...candidates].sort(byOverall).slice(0, STOCK.max);
  }
  return { plays, firstCompletion: null };
}

export interface CampaignStats {
  campaigns: number;
  maxPlays: number;
  /** 初回プレイ（ストックなし）の到達試合数 */
  firstPlay: { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number };
  /** 初完走までのプレイ回数（maxPlays 以内に完走したキャンペーンのみ）と、完走できた割合 */
  firstCompletion: { completedShare: number; p25: number | null; p50: number | null; p75: number | null; within10: number; within20: number };
  /** プレイ回数ごとの到達試合数の平均（そのプレイまで続いたキャンペーン＝まだ完走していないもの） */
  reachedByPlay: Record<number, number>;
  /** プレイ回数ごとの連れて行った選手の総合力の平均 */
  pickAverageByPlay: Record<number, number>;
}

export function simulateCampaigns(count: number, seed0: number, bot: CampaignBot, rules: RunRules = DEFAULT_RULES, maxPlays = 40): CampaignStats {
  const results = Array.from({ length: count }, (_, i) => simulateCampaign(seed0 + i, bot, rules, maxPlays));
  const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
  const first = results.map((r) => r.plays[0]!.reached).sort((a, b) => a - b);
  const done = results.map((r) => r.firstCompletion).filter((x): x is number => x !== null).sort((a, b) => a - b);
  // 完走しなかったキャンペーンは「maxPlays より後」として中央値などを計算する
  const all = results.map((r) => r.firstCompletion ?? Infinity).sort((a, b) => a - b);
  const pick = (p: number) => {
    const v = q(all, p);
    return Number.isFinite(v) ? v : null;
  };
  const checkpoints = [1, 2, 3, 5, 10, 15, 20, 30, 40].filter((n) => n <= maxPlays);
  const meanAt = (n: number, f: (p: PlayRecord) => number) => {
    const xs = results.map((r) => r.plays[n - 1]).filter((p): p is PlayRecord => p !== undefined);
    return xs.length ? xs.reduce((s, p) => s + f(p), 0) / xs.length : NaN;
  };
  return {
    campaigns: count,
    maxPlays,
    firstPlay: {
      p10: q(first, 0.1),
      p25: q(first, 0.25),
      p50: q(first, 0.5),
      p75: q(first, 0.75),
      p90: q(first, 0.9),
      mean: first.reduce((a, b) => a + b, 0) / first.length,
    },
    firstCompletion: {
      completedShare: done.length / count,
      p25: pick(0.25),
      p50: pick(0.5),
      p75: pick(0.75),
      within10: all.filter((x) => x <= 10).length / count,
      within20: all.filter((x) => x <= 20).length / count,
    },
    reachedByPlay: Object.fromEntries(checkpoints.map((n) => [n, meanAt(n, (p) => p.reached)])),
    pickAverageByPlay: Object.fromEntries(checkpoints.map((n) => [n, meanAt(n, (p) => p.pickAverage)])),
  };
}
