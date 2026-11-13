/**
 * ローグライク進行（SPEC 5）。すべて純粋関数で、新しい RunState を返す（引数は変更しない）。
 * 乱数は state.rngState から引き、使った後の状態を書き戻す（同じ状態・同じ操作なら同じ結果）。
 */
import {
  BOSS_REWARD,
  CONTROL_MAX,
  FIELDER_ABILITY_MAX,
  INITIAL_LIFE,
  INITIAL_POINTS,
  INITIAL_ROSTER_SIZE,
  LIFE_PRICE,
  MAX_ROSTER_SIZE,
  MIN_ROSTER_SIZE,
  OPPONENT,
  PITCH_RATING_MAX,
  PLAYER_GENERATION,
  QUICK_MAX,
  STAMINA_MAX,
  VELOCITY_MAX_KMH,
  WIN_POINT_RATIO,
  WIN_POINT_ROUNDING,
  WISDOM_MAX,
} from '../config';
import { simulateGame } from '../game/engine';
import { buildAutoPlan, validatePlan } from '../game/plan';
import { reconcilePlan } from '../game/planEdit';
import type { TeamEntry } from '../game/types';
import { generatePlayers } from '../generate';
import { fullName } from '../names';
import { calcOverall } from '../overall';
import { Rng } from '../rng';
import { generateOpponentRoster } from '../team';
import { FIELDER_ABILITY_KEYS, FIELDER_ABILITY_LABELS, PITCH_LABELS, type Player } from '../types';
import type { CurrentGame, GameSummary, Outcome, RunState } from './types';

export const MY_TEAM_NAME = '自チーム';

/** 試合番号から強さの段階を求める（SPEC 5.4） */
export function stageOf(gameNumber: number): { stage: number; boss: boolean; average: number } {
  const stage = Math.floor((gameNumber - 1) / OPPONENT.gamesPerStage);
  const boss = gameNumber % OPPONENT.gamesPerStage === 0;
  const average = (boss ? OPPONENT.bossBase : OPPONENT.normalBase) + OPPONENT.step * stage;
  return { stage, boss, average };
}

/** 勝利ポイント（相手選手の総合力の平均 × 1/10、端数は config） */
export function winPoints(opponent: readonly Player[]): number {
  const avg = opponent.reduce((s, p) => s + calcOverall(p), 0) / opponent.length;
  const raw = avg * WIN_POINT_RATIO;
  return WIN_POINT_ROUNDING === 'round' ? Math.round(raw) : WIN_POINT_ROUNDING === 'ceil' ? Math.ceil(raw) : Math.floor(raw);
}

export function averageOverall(players: readonly Player[]): number {
  return players.reduce((s, p) => s + calcOverall(p), 0) / players.length;
}

/** 乱数を使う処理を、state の PRNG 状態を進めながら実行する */
function withRng<T>(state: RunState, fn: (rng: Rng) => T): { value: T; rngState: number } {
  const rng = new Rng(0);
  rng.setState(state.rngState);
  const value = fn(rng);
  return { value, rngState: rng.getState() };
}

/** 新しいゲームを始める（初期選手9名・ポイント500・ライフ3） */
export function createRun(seed: number): RunState {
  const rng = new Rng(seed);
  const roster = generatePlayers(rng, INITIAL_ROSTER_SIZE, { targetOverall: PLAYER_GENERATION.initialTargetOverall });
  return {
    version: 1,
    seed,
    rngState: rng.getState(),
    status: 'strategy',
    gameNumber: 1,
    life: INITIAL_LIFE,
    points: INITIAL_POINTS,
    roster,
    plan: buildAutoPlan(roster),
    planNotes: [],
    record: { wins: 0, losses: 0, draws: 0 },
    history: [],
    current: null,
  };
}

export class RunError extends Error {}

function assertStatus(state: RunState, ...allowed: RunState['status'][]) {
  if (!allowed.includes(state.status)) throw new RunError(`この操作は現在の状態（${state.status}）ではできません`);
}

/** 作戦を更新する（試合前のみ） */
export function setPlan(state: RunState, plan: RunState['plan']): RunState {
  assertStatus(state, 'strategy');
  return { ...state, plan, planNotes: [] };
}

/**
 * 試合を行う。相手を生成し（12名・先発スタミナ100以上）、先攻・後攻をランダムに決め、試合を最後まで計算して
 * 結果（勝利ポイント・ライフ・戦績）を反映する。画面はこのあと試合を再生する。
 */
export function playGame(state: RunState): RunState {
  assertStatus(state, 'strategy');
  const errors = validatePlan(state.plan, state.roster);
  if (errors.length > 0) throw new RunError(`作戦に問題があります：${errors.join(' / ')}`);

  const { boss, average } = stageOf(state.gameNumber);
  const { value, rngState } = withRng(state, (rng) => {
    const opponent = generateOpponentRoster(rng, average);
    const mine: TeamEntry = { name: MY_TEAM_NAME, players: state.roster, plan: state.plan };
    const opp: TeamEntry = {
      name: `${boss ? 'ボス' : '相手'}（第${state.gameNumber}戦）`,
      players: opponent,
      plan: buildAutoPlan(opponent),
    };
    const side: 'away' | 'home' = rng.next() < 0.5 ? 'away' : 'home';
    const [away, home] = side === 'away' ? [mine, opp] : [opp, mine];
    const game = simulateGame(away, home, rng.int(0, 0x7fffffff));
    return { opponent, side, game };
  });

  const { opponent, side, game } = value;
  const other = side === 'away' ? 'home' : 'away';
  const outcome: Outcome = game.winner === 'draw' ? 'draw' : game.winner === side ? 'win' : 'loss';
  const pointsGained = outcome === 'win' ? winPoints(opponent) : 0;
  const current: CurrentGame = {
    gameNumber: state.gameNumber,
    boss,
    targetAverage: average,
    opponentAverage: averageOverall(opponent),
    opponent,
    side,
    game,
    outcome,
    pointsGained,
    acquired: false,
  };
  const summary: GameSummary = {
    gameNumber: state.gameNumber,
    boss,
    opponentAverage: current.opponentAverage,
    side,
    score: { mine: game.score[side], opponent: game.score[other] },
    outcome,
    pointsGained,
  };
  return {
    ...state,
    rngState,
    status: 'game',
    points: state.points + pointsGained,
    life: outcome === 'loss' ? state.life - 1 : state.life,
    record: {
      wins: state.record.wins + (outcome === 'win' ? 1 : 0),
      losses: state.record.losses + (outcome === 'loss' ? 1 : 0),
      draws: state.record.draws + (outcome === 'draw' ? 1 : 0),
    },
    history: [...state.history, summary],
    current,
    planNotes: [],
  };
}

/** 試合の再生を終えて結果画面へ */
export function showResult(state: RunState): RunState {
  assertStatus(state, 'game');
  return { ...state, status: 'result' };
}

/** 補強ができるか（勝利後の結果画面のみ） */
export function canReinforce(state: RunState): boolean {
  return state.status === 'result' && state.current?.outcome === 'win';
}

/** 相手選手を獲得できない理由（できるなら null） */
export function acquireBlocker(state: RunState, playerId: string): string | null {
  if (!canReinforce(state)) return '補強は勝利後の補強フェーズでのみできます';
  const cur = state.current!;
  if (cur.acquired) return '獲得は1試合につき1人までです';
  const p = cur.opponent.find((x) => x.id === playerId);
  if (!p) return '相手チームにいない選手です';
  if (state.roster.length >= MAX_ROSTER_SIZE) return `所持枠（${MAX_ROSTER_SIZE}名）が埋まっています。先に売却してください`;
  const cost = calcOverall(p);
  if (state.points < cost) return `ポイントが足りません（必要 ${cost}）`;
  return null;
}

/** 相手選手を獲得する（総合力と同じポイントを支払い、ロースターに追加） */
export function acquirePlayer(state: RunState, playerId: string): RunState {
  const blocker = acquireBlocker(state, playerId);
  if (blocker) throw new RunError(blocker);
  const cur = state.current!;
  const p = cur.opponent.find((x) => x.id === playerId)!;
  // ID の重複を避ける（相手と自チームでIDが衝突した場合のみ付け直す）
  const taken = new Set(state.roster.map((x) => x.id));
  const player: Player = taken.has(p.id) ? { ...p, id: `${p.id}_${state.gameNumber}` } : { ...p };
  return {
    ...state,
    points: state.points - calcOverall(p),
    roster: [...state.roster, player],
    current: { ...cur, acquired: true },
  };
}

/** 選手を売却できない理由（できるなら null） */
export function sellBlocker(state: RunState, playerId: string): string | null {
  if (!canReinforce(state)) return '売却は勝利後の補強フェーズでのみできます';
  if (!state.roster.some((p) => p.id === playerId)) return '所持していない選手です';
  if (state.roster.length <= MIN_ROSTER_SIZE) return `保有選手が${MIN_ROSTER_SIZE}名未満になるため売却できません`;
  return null;
}

/** 選手を売却する（総合力と同じポイントを得る） */
export function sellPlayer(state: RunState, playerId: string): RunState {
  const blocker = sellBlocker(state, playerId);
  if (blocker) throw new RunError(blocker);
  const p = state.roster.find((x) => x.id === playerId)!;
  return { ...state, points: state.points + calcOverall(p), roster: state.roster.filter((x) => x.id !== playerId) };
}

export function buyLifeBlocker(state: RunState): string | null {
  if (!canReinforce(state)) return 'ライフの購入は勝利後の補強フェーズでのみできます';
  if (state.points < LIFE_PRICE) return `ポイントが足りません（必要 ${LIFE_PRICE}）`;
  return null;
}

/** ライフを1つ購入する（上限なし） */
export function buyLife(state: RunState): RunState {
  const blocker = buyLifeBlocker(state);
  if (blocker) throw new RunError(blocker);
  return { ...state, points: state.points - LIFE_PRICE, life: state.life + 1 };
}

/** 次の試合へ進む（試合数が100に達していれば終了、ライフ0ならゲームオーバー） */
function proceed(state: RunState): RunState {
  if (state.life <= 0) return { ...state, status: 'gameover' };
  if (state.gameNumber >= OPPONENT.totalGames) return { ...state, status: 'finished' };
  const names = new Map(state.roster.map((p) => [p.id, fullName(p.name)]));
  const allNames = new Map([...(state.current?.game.away.players ?? []), ...(state.current?.game.home.players ?? [])].map((p) => [p.id, fullName(p.name)]));
  const { plan, notes } = reconcilePlan(state.plan, state.roster, (id) => names.get(id) ?? allNames.get(id) ?? id);
  return { ...state, status: 'strategy', gameNumber: state.gameNumber + 1, plan, planNotes: notes, current: null };
}

/**
 * 結果画面を終える。ボス戦に勝っていれば特別報酬へ、それ以外は次の試合へ（または終了）。
 */
export function finishResult(state: RunState): RunState {
  assertStatus(state, 'result');
  const cur = state.current!;
  if (cur.outcome === 'win' && cur.boss) return { ...state, status: 'bossReward' };
  return proceed(state);
}

/** ボス報酬で選手の能力がどう変わるか（実際の強化は applyBossReward。球種の強化先は乱数で決まる） */
export function bossRewardPreview(player: Player): string[] {
  const out: string[] = [];
  const up = (label: string, before: number, max: number, add: number, unit = '') => {
    const after = Math.min(max, before + add);
    if (after > before) out.push(`${label} ${before}${unit}→${after}${unit}`);
  };
  for (const k of FIELDER_ABILITY_KEYS) up(FIELDER_ABILITY_LABELS[k], player.fielder[k], FIELDER_ABILITY_MAX, BOSS_REWARD.perAbility);
  up('賢さ', player.wisdom, WISDOM_MAX, BOSS_REWARD.perAbility);
  up('球速', player.pitcher.velocityKmh, VELOCITY_MAX_KMH, BOSS_REWARD.velocityKmh, 'km/h');
  up('クイック', player.pitcher.quick, QUICK_MAX, BOSS_REWARD.perAbility);
  up('コントロール', player.pitcher.control, CONTROL_MAX, BOSS_REWARD.perAbility);
  up('スタミナ', player.pitcher.stamina, STAMINA_MAX, BOSS_REWARD.perAbility, '球');
  const room = player.pitcher.pitches.reduce((s, p) => s + (PITCH_RATING_MAX - p.rating), 0);
  const pitchUp = Math.min(room, BOSS_REWARD.pitchPoints);
  if (pitchUp > 0) out.push(`球種 合計+${pitchUp}（所持球種からランダム）`);
  return out;
}

/** ボス報酬を適用した選手を返す（球種は所持球種からランダムに1ずつ。上限に達した球種は除外、余りは切り捨て） */
export function applyBossRewardToPlayer(player: Player, rng: Rng): { player: Player; changes: string[] } {
  const changes = bossRewardPreview(player).filter((c) => !c.startsWith('球種'));
  const add = (v: number, max: number, n: number) => Math.min(max, v + n);
  const fielder = { ...player.fielder };
  for (const k of FIELDER_ABILITY_KEYS) fielder[k] = add(fielder[k], FIELDER_ABILITY_MAX, BOSS_REWARD.perAbility);
  const pitches = player.pitcher.pitches.map((p) => ({ ...p }));
  for (let i = 0; i < BOSS_REWARD.pitchPoints; i++) {
    const open = pitches.filter((p) => p.rating < PITCH_RATING_MAX);
    if (open.length === 0) break;
    const target = rng.pick(open);
    target.rating++;
    changes.push(`${PITCH_LABELS[target.type]} ${target.rating - 1}→${target.rating}`);
  }
  return {
    player: {
      ...player,
      fielder,
      wisdom: add(player.wisdom, WISDOM_MAX, BOSS_REWARD.perAbility),
      pitcher: {
        ...player.pitcher,
        velocityKmh: add(player.pitcher.velocityKmh, VELOCITY_MAX_KMH, BOSS_REWARD.velocityKmh),
        quick: add(player.pitcher.quick, QUICK_MAX, BOSS_REWARD.perAbility),
        control: add(player.pitcher.control, CONTROL_MAX, BOSS_REWARD.perAbility),
        stamina: add(player.pitcher.stamina, STAMINA_MAX, BOSS_REWARD.perAbility),
        pitches,
      },
    },
    changes,
  };
}

/** ボス報酬：保有選手を1人選んで強化し、次の試合へ（100戦目なら終了） */
export function applyBossReward(state: RunState, playerId: string): RunState {
  assertStatus(state, 'bossReward');
  const target = state.roster.find((p) => p.id === playerId);
  if (!target) throw new RunError('所持していない選手です');
  const { value, rngState } = withRng(state, (rng) => applyBossRewardToPlayer(target, rng));
  const roster = state.roster.map((p) => (p.id === playerId ? value.player : p));
  return proceed({ ...state, rngState, roster, lastBossReward: { playerId, changes: value.changes } });
}
