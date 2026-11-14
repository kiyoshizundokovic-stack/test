/**
 * セーブデータの検証とマイグレーション（SPEC 6）。
 * - 進行中のプレイ：バージョン1（フェーズ6の形式。保存は未実装だったが形式としては存在した）→ 2 → 3
 *   2：プレイID・選手の通し番号・ストックから連れて行った選手・再戦の情報
 *   3：このプレイでの選手ごとの成績（playStats）
 *   4：次の試合の相手（next。再戦の情報 rematch を統合）・補強フェーズの状態（current.reinforce）
 * - ストック：バージョン2から（3・4で形式の変更なし）。通算成績に項目が増えたときは、欠けている項目を0で補う
 */
import { buildAutoPlan } from '../game/plan';
import type { GamePlan } from '../game/types';
import { prepareNextOpponent } from '../run/run';
import type { CurrentGame, GameSummary, RunState } from '../run/types';
import { BATTING_STAT_KEYS, emptyCareer, PITCHING_STAT_KEYS, type CareerStats, type StockData, type StockEntry } from '../stock/types';
import { FIELDER_ABILITY_KEYS, type Player } from '../types';
import { SAVE_VERSION, SaveFormatError, type PlaySave, type StockSave } from './format';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (msg: string): never => {
  throw new SaveFormatError(msg);
};
const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`${path} が数値ではありません`));
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(`${path} が文字列ではありません`));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(`${path} が配列ではありません`));

/** 選手データの最低限の検証（能力の項目がそろっているか） */
export function validatePlayer(v: unknown, path = '選手'): Player {
  if (!isObj(v)) return fail(`${path} の形式が正しくありません`);
  str(v.id, `${path}.id`);
  const name = isObj(v.name) ? v.name : fail(`${path}.name がありません`);
  str(name.family, `${path}.name.family`);
  str(name.given, `${path}.name.given`);
  const f = isObj(v.fielder) ? v.fielder : fail(`${path}.fielder がありません`);
  for (const k of FIELDER_ABILITY_KEYS) num(f[k], `${path}.fielder.${k}`);
  num(v.wisdom, `${path}.wisdom`);
  const p = isObj(v.pitcher) ? v.pitcher : fail(`${path}.pitcher がありません`);
  for (const k of ['velocityKmh', 'quick', 'control', 'stamina']) num(p[k], `${path}.pitcher.${k}`);
  const pitches = arr(p.pitches, `${path}.pitcher.pitches`);
  if (pitches.length === 0) fail(`${path} の球種がありません`);
  arr(v.traits, `${path}.traits`);
  return v as unknown as Player;
}

// ---------------------------------------------------------------------------
// 進行中のプレイ
// ---------------------------------------------------------------------------

/** バージョン1（フェーズ6）の RunState をバージョン2に変換する */
export function migrateRunV1toV2(v1: Obj): Obj {
  const seed = num(v1.seed, 'run.seed');
  const history = arr(v1.history, 'run.history').map((h) => ({ ...(h as Obj), rematch: false }) as unknown as GameSummary);
  let current: CurrentGame | null = null;
  if (isObj(v1.current)) {
    const c = v1.current;
    const opponent = arr(c.opponent, 'run.current.opponent').map((p, i) => validatePlayer(p, `run.current.opponent[${i}]`));
    const game = isObj(c.game) ? c.game : fail('run.current.game がありません');
    const side = c.side === 'home' ? 'home' : 'away';
    const opponentTeam = isObj(game[side === 'away' ? 'home' : 'away']) ? (game[side === 'away' ? 'home' : 'away'] as Obj) : {};
    current = {
      ...(c as unknown as CurrentGame),
      rematch: false,
      opponentName: typeof opponentTeam.name === 'string' ? opponentTeam.name : '相手',
      opponentPlan: isObj(opponentTeam.plan) ? (opponentTeam.plan as unknown as GamePlan) : buildAutoPlan(opponent),
    };
  }
  const run = {
    ...(v1 as unknown as RunState),
    version: 2,
    runId: `legacy-${seed}`,
    // 旧形式の選手ID（乱数由来）はそのまま。新しく生成する選手はプレイID＋通し番号になる
    nextSerial: 0,
    stockPlayerIds: [],
    history,
    current,
    rematch: null,
  };
  return run as unknown as Obj;
}

/** バージョン2の RunState をバージョン3に変換する（このプレイでの成績を空で追加） */
export function migrateRunV2toV3(v2: Obj): Obj {
  return { ...v2, version: 3, playStats: {} };
}

/**
 * バージョン3の RunState をバージョン4に変換する。
 * - 再戦の情報（rematch）は next（rematch: true）に移す
 * - 試合前（作戦の状態）で再戦でなければ、次の相手をここで生成する（乱数の順序は従来と同じ：試合開始時に生成していたものを先に生成するだけ）
 * - 勝利後の補強フェーズ中なら、読み込んだ時点の状態を「やり直し」の基準にする（それ以前の売却は取り消せない）
 */
export function migrateRunV3toV4(v3: Obj): Obj {
  const { rematch, ...rest } = v3;
  const next = isObj(rematch) ? { ...rematch, rematch: true } : null;
  let current = rest.current;
  if (isObj(current)) {
    const win = current.outcome === 'win' && rest.status === 'result';
    current = { ...current, reinforce: win ? { start: { roster: rest.roster, points: rest.points, life: rest.life }, sold: [] } : null };
  }
  const v4 = { ...rest, version: 4, current, next } as unknown as RunState;
  return (v4.status === 'strategy' ? prepareNextOpponent(v4) : v4) as unknown as Obj;
}

/** RunState（バージョン4）の検証 */
export function validateRun(v: unknown): RunState {
  if (!isObj(v)) return fail('進行中のプレイの形式が正しくありません');
  if (v.version !== 4) fail(`進行中のプレイのバージョンが対応していません（${String(v.version)}）`);
  if (!isObj(v.playStats)) fail('run.playStats がありません');
  str(v.runId, 'run.runId');
  num(v.nextSerial, 'run.nextSerial');
  arr(v.stockPlayerIds, 'run.stockPlayerIds');
  num(v.seed, 'run.seed');
  num(v.rngState, 'run.rngState');
  const statuses = ['strategy', 'game', 'result', 'bossReward', 'gameover', 'finished'];
  if (!statuses.includes(v.status as string)) fail(`run.status が不正です（${String(v.status)}）`);
  num(v.gameNumber, 'run.gameNumber');
  num(v.life, 'run.life');
  num(v.points, 'run.points');
  const roster = arr(v.roster, 'run.roster');
  roster.forEach((p, i) => validatePlayer(p, `run.roster[${i}]`));
  if (!isObj(v.plan) || !Array.isArray(v.plan.stages)) fail('run.plan の形式が正しくありません');
  if (!isObj(v.record)) fail('run.record がありません');
  arr(v.history, 'run.history');
  if (['game', 'result', 'bossReward'].includes(v.status as string) && !isObj(v.current)) fail('試合中・試合後の状態なのに run.current がありません');
  if (v.status === 'strategy' && !isObj(v.next)) fail('試合前の状態なのに run.next（次の相手）がありません');
  return v as unknown as RunState;
}

/** バージョンに応じて RunState を最新に変換する（1 → 2 → 3 → 4 の順に変換） */
export function migrateRun(v: unknown): RunState {
  if (!isObj(v)) return fail('進行中のプレイの形式が正しくありません');
  let cur: Obj = v;
  if (cur.version === 1) cur = migrateRunV1toV2(cur) as unknown as Obj;
  if (cur.version === 2) cur = migrateRunV2toV3(cur);
  if (cur.version === 3) cur = migrateRunV3toV4(cur);
  return validateRun(cur);
}

/** 保存・エクスポートされたプレイ（{ kind: 'play', version, run }）を読み込み、最新の形式で返す */
export function readPlaySave(raw: unknown): PlaySave {
  if (!isObj(raw)) return fail('プレイのデータではありません');
  // バージョン1のエクスポートは RunState をそのまま出していた想定（kind なし）
  if (raw.kind === undefined && raw.version === 1 && 'roster' in raw) {
    return { kind: 'play', version: SAVE_VERSION, savedAt: '', run: migrateRun(raw) };
  }
  if (raw.kind !== 'play') fail(raw.kind === 'stock' ? 'これはストックのデータです（プレイのデータを選んでください）' : 'プレイのデータではありません');
  const version = num(raw.version, 'version');
  if (version > SAVE_VERSION) fail(`新しいバージョン（${version}）のデータです。アプリを更新してください`);
  return { kind: 'play', version: SAVE_VERSION, savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '', run: migrateRun(raw.run) };
}

// ---------------------------------------------------------------------------
// ストック
// ---------------------------------------------------------------------------

/** 通算成績の欠けている項目を0で補う（項目の追加に対応するため） */
export function normalizeCareer(v: unknown): CareerStats {
  const base = emptyCareer();
  if (!isObj(v)) return base;
  const b = isObj(v.batting) ? v.batting : {};
  const p = isObj(v.pitching) ? v.pitching : {};
  for (const k of BATTING_STAT_KEYS) if (typeof b[k] === 'number') base.batting[k] = b[k] as number;
  for (const k of PITCHING_STAT_KEYS) if (typeof p[k] === 'number') base.pitching[k] = p[k] as number;
  if (typeof v.plays === 'number') base.plays = v.plays;
  if (typeof v.completions === 'number') base.completions = v.completions;
  return base;
}

export function validateStock(v: unknown): StockData {
  if (!isObj(v)) return fail('ストックの形式が正しくありません');
  const entries = arr(v.entries, 'stock.entries').map((e, i): StockEntry => {
    if (!isObj(e)) return fail(`stock.entries[${i}] の形式が正しくありません`);
    return {
      player: validatePlayer(e.player, `stock.entries[${i}].player`),
      favorite: e.favorite === true,
      addedAt: typeof e.addedAt === 'string' ? e.addedAt : '',
      career: normalizeCareer(e.career),
    };
  });
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.player.id)) fail(`ストックに同じIDの選手が重複しています（${e.player.id}）`);
    ids.add(e.player.id);
  }
  return { entries };
}

/** 保存・エクスポートされたストック（{ kind: 'stock', version, stock }）を読み込み、最新の形式で返す */
export function readStockSave(raw: unknown): StockSave {
  if (!isObj(raw)) return fail('ストックのデータではありません');
  if (raw.kind !== 'stock') fail(raw.kind === 'play' ? 'これはプレイのデータです（ストックのデータを選んでください）' : 'ストックのデータではありません');
  const version = num(raw.version, 'version');
  if (version > SAVE_VERSION) fail(`新しいバージョン（${version}）のデータです。アプリを更新してください`);
  return { kind: 'stock', version: SAVE_VERSION, savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '', stock: validateStock(raw.stock) };
}

// ---------------------------------------------------------------------------
// エクスポート（JSON文字列）
// ---------------------------------------------------------------------------

export function makePlaySave(run: RunState, savedAt: string): PlaySave {
  return { kind: 'play', version: SAVE_VERSION, savedAt, run };
}

export function makeStockSave(stock: StockData, savedAt: string): StockSave {
  return { kind: 'stock', version: SAVE_VERSION, savedAt, stock };
}

/** JSON文字列を読んで、プレイまたはストックのデータとして返す（どちらかを自動判定） */
export function parseSaveJson(text: string): PlaySave | StockSave {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('JSONとして読み込めません');
  }
  if (isObj(raw) && raw.kind === 'stock') return readStockSave(raw);
  return readPlaySave(raw);
}
