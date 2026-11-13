/**
 * ローグライク全体のシミュレーション（バランス検証用。分析専用）。
 * src/core/run/run.ts と同じ順序で乱数を使い、規則（ライフ・価格・相手の強さなど）を差し替えて比較できるようにしたもの。
 * 既定の規則・同じ方針なら run.ts と同じ結果になる（sim.test.ts で確認）。
 */
import { INITIAL_LIFE, INITIAL_POINTS, INITIAL_ROSTER_SIZE, LIFE_PRICE, MAX_ROSTER_SIZE, MIN_ROSTER_SIZE, OPPONENT, PLAYER_GENERATION, WIN_POINT_RATIO } from '../config';
import { simulateGame } from '../game/engine';
import { buildAutoPlan } from '../game/plan';
import type { GamePlan, TeamEntry } from '../game/types';
import { generatePlayers } from '../generate';
import { calcOverall } from '../overall';
import { Rng } from '../rng';
import { applyBossRewardToPlayer } from '../run/run';
import { generateOpponentRoster } from '../team';
import type { Player } from '../types';
import { optimizedPlan, randomPlan } from './strategy';

export interface RunRules {
  initialRosterSize: number;
  initialTargetOverall: number;
  initialLife: number;
  initialPoints: number;
  lifePrice: number;
  winPointRatio: number;
  normalBase: number;
  bossBase: number;
  step: number;
  /** 敵の作戦：ai＝相手AI（現仕様）、random＝打順・守備配置をランダム */
  enemyPlan: 'ai' | 'random';
  /** ボス戦勝利時に回復するライフ（現仕様は0） */
  lifeOnBossWin: number;
  totalGames: number;
}

export const DEFAULT_RULES: RunRules = {
  initialRosterSize: INITIAL_ROSTER_SIZE,
  initialTargetOverall: PLAYER_GENERATION.initialTargetOverall,
  initialLife: INITIAL_LIFE,
  initialPoints: INITIAL_POINTS,
  lifePrice: LIFE_PRICE,
  winPointRatio: WIN_POINT_RATIO,
  normalBase: OPPONENT.normalBase,
  bossBase: OPPONENT.bossBase,
  step: OPPONENT.step,
  enemyPlan: 'ai',
  lifeOnBossWin: 0,
  totalGames: OPPONENT.totalGames,
};

/** 補強の方針 */
export type ReinforcePolicy = 'none' | 'lifeFirst' | 'playerFirst' | 'balanced';
export const POLICY_LABELS: Record<ReinforcePolicy, string> = {
  none: '補強しない',
  lifeFirst: 'ライフ優先',
  playerFirst: '選手優先',
  balanced: 'バランス',
};

export interface Bot {
  plan: 'ai' | 'optimized';
  reinforce: ReinforcePolicy;
}

export interface RunOutcome {
  /** 戦った試合数 */
  reached: number;
  finished: boolean;
  wins: number;
  losses: number;
  draws: number;
  livesBought: number;
  playersAcquired: number;
  bossWins: number;
  finalAverage: number;
  finalPoints: number;
}

const avg = (ps: readonly Player[]) => ps.reduce((s, p) => s + calcOverall(p), 0) / ps.length;

/** 補強：方針に従ってライフ購入・選手獲得（必要なら最弱を売却）を行う */
function reinforce(
  policy: ReinforcePolicy,
  st: { roster: Player[]; points: number; life: number },
  opponent: readonly Player[],
  rules: RunRules,
): { livesBought: number; acquired: boolean } {
  let livesBought = 0;
  let acquired = false;
  const buyLives = (max: number) => {
    while (livesBought < max && st.points >= rules.lifePrice) {
      st.points -= rules.lifePrice;
      st.life++;
      livesBought++;
    }
  };
  /** minGain：入れ替えで総合力がこれ以上上がる場合だけ獲得する */
  const tryAcquire = (minGain = 1) => {
    const best = [...opponent].sort((a, b) => calcOverall(b) - calcOverall(a))[0]!;
    const cost = calcOverall(best);
    const worst = [...st.roster].sort((a, b) => calcOverall(a) - calcOverall(b))[0]!;
    if (calcOverall(best) - calcOverall(worst) < minGain && st.roster.length >= MAX_ROSTER_SIZE) return;
    if (st.roster.length < MAX_ROSTER_SIZE) {
      if (st.points >= cost) {
        st.points -= cost;
        st.roster = [...st.roster, { ...best }];
        acquired = true;
      }
      return;
    }
    // 枠が埋まっている：最弱より強く、売却後に買えるなら入れ替える
    if (calcOverall(best) > calcOverall(worst) && st.roster.length > MIN_ROSTER_SIZE && st.points + calcOverall(worst) >= cost) {
      st.points += calcOverall(worst) - cost;
      st.roster = [...st.roster.filter((p) => p !== worst), { ...best }];
      acquired = true;
    }
  };
  if (policy === 'lifeFirst') {
    // ポイントはすべてライフに使う（選手は獲得しない）
    buyLives(Infinity);
  } else if (policy === 'playerFirst') {
    // ライフが1のときだけ1つ買い、あとは選手を獲得
    if (st.life <= 1) buyLives(1);
    tryAcquire();
  } else if (policy === 'balanced') {
    // ライフが3になるまで買い、総合力が50以上上がる入れ替えだけ行う
    buyLives(Math.max(0, 3 - st.life));
    tryAcquire(50);
  }
  return { livesBought, acquired };
}

export function simulateRun(seed: number, bot: Bot, rules: RunRules = DEFAULT_RULES): RunOutcome {
  const rng = new Rng(seed);
  const st = {
    roster: generatePlayers(rng, rules.initialRosterSize, { targetOverall: rules.initialTargetOverall }),
    points: rules.initialPoints,
    life: rules.initialLife,
  };
  const out: RunOutcome = {
    reached: 0, finished: false, wins: 0, losses: 0, draws: 0, livesBought: 0, playersAcquired: 0, bossWins: 0, finalAverage: 0, finalPoints: 0,
  };
  let plan: GamePlan | null = null;
  let planKey = '';
  // 作戦を作り直す条件：optimized は能力が変わったら（ボス報酬など）、ai は顔ぶれが変わったときだけ（実際のゲームと同じく作戦を引き継ぐ）
  const rosterKey = () => st.roster.map((p) => (bot.plan === 'optimized' ? `${p.id}:${calcOverall(p)}` : p.id)).join(',');

  for (let gameNumber = 1; gameNumber <= rules.totalGames; gameNumber++) {
    const stage = Math.floor((gameNumber - 1) / OPPONENT.gamesPerStage);
    const boss = gameNumber % OPPONENT.gamesPerStage === 0;
    const average = (boss ? rules.bossBase : rules.normalBase) + rules.step * stage;
    if (planKey !== rosterKey()) {
      plan = bot.plan === 'optimized' ? optimizedPlan(st.roster) : buildAutoPlan(st.roster);
      planKey = rosterKey();
    }
    // run.ts の playGame と同じ順序で乱数を使う
    const opponent = generateOpponentRoster(rng, average);
    const enemyPlan = rules.enemyPlan === 'random' ? randomPlan(opponent, new Rng(seed * 1009 + gameNumber)) : buildAutoPlan(opponent);
    const mine: TeamEntry = { name: 'mine', players: st.roster, plan: plan! };
    const opp: TeamEntry = { name: 'enemy', players: opponent, plan: enemyPlan };
    const side: 'away' | 'home' = rng.next() < 0.5 ? 'away' : 'home';
    const game = simulateGame(side === 'away' ? mine : opp, side === 'away' ? opp : mine, rng.int(0, 0x7fffffff));
    out.reached = gameNumber;
    const outcome = game.winner === 'draw' ? 'draw' : game.winner === side ? 'win' : 'loss';
    if (outcome === 'win') {
      out.wins++;
      st.points += Math.floor(avg(opponent) * rules.winPointRatio);
      const r = reinforce(bot.reinforce, st, opponent, rules);
      out.livesBought += r.livesBought;
      if (r.acquired) out.playersAcquired++;
      if (boss) {
        out.bossWins++;
        const target = [...st.roster].sort((a, b) => calcOverall(b) - calcOverall(a))[0]!;
        const { player } = applyBossRewardToPlayer(target, rng);
        st.roster = st.roster.map((p) => (p.id === target.id ? player : p));
        st.life += rules.lifeOnBossWin;
      }
    } else if (outcome === 'loss') {
      out.losses++;
      st.life--;
      if (st.life <= 0) break;
    } else out.draws++;
    if (gameNumber === rules.totalGames) out.finished = true;
  }
  out.finalAverage = avg(st.roster);
  out.finalPoints = st.points;
  return out;
}

export interface RunStats {
  runs: number;
  finishRate: number;
  reachedMean: number;
  percentiles: Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number>;
  /** 到達試合数が n 以上の割合 */
  reachedAtLeast: Record<number, number>;
  livesBoughtMean: number;
  acquiredMean: number;
  winRate: number;
  bossWinsMean: number;
  finalAverageMean: number;
}

export function simulateMany(runs: number, seed0: number, bot: Bot, rules: RunRules = DEFAULT_RULES): RunStats {
  const results = Array.from({ length: runs }, (_, i) => simulateRun(seed0 + i, bot, rules));
  const reached = results.map((r) => r.reached).sort((a, b) => a - b);
  const q = (p: number) => reached[Math.min(runs - 1, Math.floor(p * runs))]!;
  const mean = (f: (r: RunOutcome) => number) => results.reduce((s, r) => s + f(r), 0) / runs;
  const w = results.reduce((s, r) => s + r.wins, 0);
  const l = results.reduce((s, r) => s + r.losses, 0);
  const at = [10, 20, 30, 50, 70, 100];
  return {
    runs,
    finishRate: results.filter((r) => r.finished).length / runs,
    reachedMean: mean((r) => r.reached),
    percentiles: { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) },
    reachedAtLeast: Object.fromEntries(at.map((n) => [n, results.filter((r) => r.reached >= n).length / runs])),
    livesBoughtMean: mean((r) => r.livesBought),
    acquiredMean: mean((r) => r.playersAcquired),
    winRate: w / Math.max(1, w + l),
    bossWinsMean: mean((r) => r.bossWins),
    finalAverageMean: mean((r) => r.finalAverage),
  };
}
