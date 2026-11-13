/**
 * 試合の再生（SPEC 8 の試合画面用）。試合は simulateGame で最後まで計算済みで、
 * 画面はその events を先頭から何件まで見せるかだけを変える（再生の仕方で結果は変わらない）。
 */
import { computeBoxScore } from './stats';
import type { GameEvent, GameResult, Half } from './types';

export type ReplayMode = 'pa' | 'inning' | 'end';

export const REPLAY_MODE_LABELS: Record<ReplayMode, string> = {
  pa: '1打席ずつ',
  inning: '1イニングずつ',
  end: '結果まで',
};

export interface ReplayState {
  /** 表示済みのイベント数 */
  shown: number;
  finished: boolean;
  inning: number;
  half: Half;
  outs: number;
  /** 塁上の走者（一・二・三塁の選手ID） */
  bases: (string | null)[];
  score: { away: number; home: number };
  /** ここまでのイニングごとの得点（行われなかった9回裏は null） */
  lineScore: { away: (number | null)[]; home: (number | null)[] };
  hits: { away: number; home: number };
  errors: { away: number; home: number };
  /** 次に打席に立つ打者・現在の投手（試合終了後は直前の値） */
  batterId: string | null;
  pitcherId: string | null;
}

/** イベントが起きた回・表裏（守備交代は直後の打席と同じ回に属する） */
function placeOf(ev: GameEvent): { inning: number; half: Half } {
  if (ev.type === 'pa') return { inning: ev.pa.inning, half: ev.pa.half };
  if (ev.type === 'steal') return { inning: ev.steal.inning, half: ev.steal.half };
  return { inning: ev.change.inning, half: ev.change.half };
}

/** 先頭から shown 件のイベントを反映した状態 */
export function replayState(game: GameResult, shown: number): ReplayState {
  const n = Math.max(0, Math.min(shown, game.events.length));
  const finished = n >= game.events.length;
  const state: ReplayState = {
    shown: n,
    finished,
    inning: 1,
    half: 'top',
    outs: 0,
    bases: [null, null, null],
    score: { away: 0, home: 0 },
    lineScore: { away: [], home: [] },
    hits: { away: 0, home: 0 },
    errors: { away: 0, home: 0 },
    batterId: null,
    pitcherId: null,
  };
  if (finished) {
    // 試合終了：記録済みの最終結果をそのまま使う
    const box = computeBoxScore(game);
    state.score = { ...game.score };
    state.lineScore = { away: [...game.lineScore.away], home: [...game.lineScore.home] };
    state.hits = { away: box.away.hits, home: box.home.hits };
    state.errors = { away: box.away.errors, home: box.home.errors };
  }

  const partial = { ...game, events: game.events.slice(0, n) };
  if (!finished) {
    const box = computeBoxScore(partial);
    state.hits = { away: box.away.hits, home: box.home.hits };
    state.errors = { away: box.away.errors, home: box.home.errors };
  }

  for (const ev of partial.events) {
    if (ev.type === 'stage') continue;
    const play = ev.type === 'pa' ? ev.pa : ev.steal;
    const side = play.half === 'top' ? 'away' : 'home';
    const index = play.inning - 1;
    if (!finished) {
      // 途中経過のラインスコア：この回までの枠を0で用意して得点を足す
      for (let i = 0; i <= index; i++) {
        if (state.lineScore.away[i] === undefined) state.lineScore.away[i] = 0;
        if (i < index || play.half === 'bottom') {
          if (state.lineScore.home[i] === undefined) state.lineScore.home[i] = 0;
        }
      }
      state.lineScore[side][index] = (state.lineScore[side][index] ?? 0) + play.runs;
      state.score = { ...play.scoreAfter };
    }
    state.inning = play.inning;
    state.half = play.half;
    state.outs = play.outsAfter;
    state.bases = [...play.basesAfter];
    state.pitcherId = play.pitcherId;
  }
  // 3アウトになったら次の回へ（ベースは空）
  if (!finished && state.outs >= 3) {
    state.outs = 0;
    state.bases = [null, null, null];
    if (state.half === 'top') state.half = 'bottom';
    else {
      state.half = 'top';
      state.inning += 1;
    }
  }

  // 次の打者：次の打席イベントの打者
  const nextPa = game.events.slice(n).find((e) => e.type === 'pa');
  const lastPa = [...partial.events].reverse().find((e) => e.type === 'pa');
  if (nextPa?.type === 'pa') {
    state.batterId = nextPa.pa.batterId;
    state.pitcherId = nextPa.pa.pitcherId;
  } else if (lastPa?.type === 'pa') {
    state.batterId = lastPa.pa.batterId;
  }
  return state;
}

/**
 * 次に止まる位置（表示するイベント数）を返す。
 * - pa：次の打席まで（その前の盗塁・選手交代も一緒に表示する）
 * - inning：現在のハーフイニングの終わりまで
 * - end：試合終了まで
 */
export function nextStop(game: GameResult, shown: number, mode: ReplayMode): number {
  const events = game.events;
  const total = events.length;
  if (shown >= total || mode === 'end') return total;
  if (mode === 'pa') {
    for (let i = shown; i < total; i++) if (events[i]!.type === 'pa') return i + 1;
    return total;
  }
  // 現在のハーフイニング（次に表示するイベントが属する回）の最後のイベントまで
  const { inning, half } = placeOf(events[shown]!);
  let i = shown;
  while (i < total) {
    const p = placeOf(events[i]!);
    if (p.inning !== inning || p.half !== half) break;
    i++;
  }
  return i;
}
