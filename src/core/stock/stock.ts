/**
 * ストックの操作（SPEC 7.1・7.2）。すべて新しい StockData を返す純粋関数。
 */
import { STOCK } from '../config';
import { calcOverall, pitchTotal } from '../overall';
import type { RunState } from '../run/types';
import { FIELDER_ABILITY_KEYS, FIELDER_ABILITY_LABELS, type Player } from '../types';
import { addPlayStats, emptyPlayStats, STAT_DEFINITIONS } from './career';
import { emptyCareer, type StockData, type StockEntry } from './types';

export class StockError extends Error {}

export function findEntry(stock: StockData, id: string): StockEntry | undefined {
  return stock.entries.find((e) => e.player.id === id);
}

/**
 * ゲーム終了時の処理：ストックから連れて行った選手は自動で戻り（通算成績に加算）、
 * keepIds の選手を新しくストックに加える（このプレイの成績から始める）。
 * ストックの上限は超えてもよい（超えている間はニューゲームを開始できない）。
 */
export function concludeRun(stock: StockData, run: RunState, keepIds: readonly string[], now: string): StockData {
  if (run.status !== 'gameover' && run.status !== 'finished') throw new StockError('ゲームが終了していません');
  const completed = run.status === 'finished' ? 1 : 0;
  const keep = new Set(keepIds);
  const entries = [...stock.entries];
  for (const player of run.roster) {
    const stats = run.playStats[player.id] ?? emptyPlayStats();
    const fromStock = run.stockPlayerIds.includes(player.id);
    if (!fromStock && !keep.has(player.id)) continue;
    const index = entries.findIndex((e) => e.player.id === player.id);
    if (index >= 0) {
      const e = entries[index]!;
      const career = addPlayStats(e.career, stats);
      entries[index] = { ...e, career: { ...career, plays: e.career.plays + 1, completions: e.career.completions + completed } };
    } else {
      // 新しく残す選手（ストックから連れて行った選手がストックから消えていた場合もここで戻す）
      const career = addPlayStats(emptyCareer(), stats);
      entries.push({ player: { ...player }, favorite: false, addedAt: now, career: { ...career, plays: 1, completions: completed } });
    }
  }
  return { entries };
}

/** ニューゲームを始められない理由（始められるなら null） */
export function newGameBlocker(stock: StockData): string | null {
  const over = stock.entries.length - STOCK.max;
  return over > 0 ? `ストックが上限（${STOCK.max}人）を${over}人超えています。ストック一覧で削除してください` : null;
}

/** ニューゲームで連れて行く選手の選び方の問題（なければ null） */
export function picksBlocker(stock: StockData, ids: readonly string[]): string | null {
  if (ids.length > STOCK.pickMax) return `ストックから連れて行けるのは${STOCK.pickMax}人までです`;
  if (new Set(ids).size !== ids.length) return '同じ選手を2回選んでいます';
  if (ids.some((id) => !findEntry(stock, id))) return 'ストックにいない選手が含まれています';
  return null;
}

/**
 * 進行中のプレイで使っているストックの選手（削除できない）。
 * 終了したプレイの選手は対象外（終了処理で戻すときに、ストックになければ加え直す）。
 */
export function inUseIds(run: RunState | null): Set<string> {
  if (!run || run.status === 'gameover' || run.status === 'finished') return new Set();
  return new Set(run.stockPlayerIds);
}

/** 削除できない理由（できるなら null） */
export function deleteBlocker(stock: StockData, id: string, inUse: ReadonlySet<string>): string | null {
  const e = findEntry(stock, id);
  if (!e) return 'ストックにいない選手です';
  if (e.favorite) return 'お気に入りの選手は削除できません（お気に入りを外してください）';
  if (inUse.has(id)) return '進行中のプレイに連れて行っている選手は削除できません';
  return null;
}

/** まとめて削除する。削除できない選手（お気に入り・プレイ中）は残し、その人数を返す */
export function deleteEntries(stock: StockData, ids: readonly string[], inUse: ReadonlySet<string>): { stock: StockData; deleted: number; skipped: number } {
  const targets = new Set(ids.filter((id) => deleteBlocker(stock, id, inUse) === null));
  return {
    stock: { entries: stock.entries.filter((e) => !targets.has(e.player.id)) },
    deleted: targets.size,
    skipped: ids.length - targets.size,
  };
}

export function setFavorite(stock: StockData, id: string, favorite: boolean): StockData {
  return { entries: stock.entries.map((e) => (e.player.id === id ? { ...e, favorite } : e)) };
}

/** 名前の検証（前後の空白を除き、姓・名それぞれ1〜STOCK.nameMaxLength 文字）。問題がなければ整えた名前を返す */
export function normalizeName(family: string, given: string): { family: string; given: string } {
  const f = family.trim();
  const g = given.trim();
  const len = (s: string) => [...s].length;
  if (len(f) < 1 || len(g) < 1) throw new StockError('姓と名を入力してください');
  if (len(f) > STOCK.nameMaxLength || len(g) > STOCK.nameMaxLength) throw new StockError(`姓・名はそれぞれ${STOCK.nameMaxLength}文字までです`);
  return { family: f, given: g };
}

export function renamePlayer(stock: StockData, id: string, family: string, given: string): StockData {
  const name = normalizeName(family, given);
  if (!findEntry(stock, id)) throw new StockError('ストックにいない選手です');
  return { entries: stock.entries.map((e) => (e.player.id === id ? { ...e, player: { ...e.player, name } } : e)) };
}

/** ストックの読み込み（追加）：同じIDの選手は読み込んだ側で上書きし、新しい選手は末尾に加える */
export function mergeStock(base: StockData, incoming: StockData): { stock: StockData; added: number; updated: number } {
  const incomingById = new Map(incoming.entries.map((e) => [e.player.id, e]));
  let updated = 0;
  const entries = base.entries.map((e) => {
    const repl = incomingById.get(e.player.id);
    if (!repl) return e;
    updated++;
    incomingById.delete(e.player.id);
    return repl;
  });
  const added = [...incomingById.values()];
  return { stock: { entries: [...entries, ...added] }, added: added.length, updated };
}

// ---------------------------------------------------------------------------
// ソート
// ---------------------------------------------------------------------------

export interface SortOption {
  key: string;
  label: string;
  group: '基本' | '能力' | '通算成績';
  value: (e: StockEntry) => number | string | null;
  /** 既定の並び順（小さいほど良い指標・名前・日時は昇順） */
  defaultAscending?: boolean;
}

const ability = (label: string, key: string, f: (p: Player) => number): SortOption => ({ key, label, group: '能力', value: (e) => f(e.player) });

export const SORT_OPTIONS: readonly SortOption[] = [
  { key: 'overall', label: '総合力', group: '基本', value: (e) => calcOverall(e.player) },
  { key: 'name', label: '名前', group: '基本', value: (e) => `${e.player.name.family}${e.player.name.given}`, defaultAscending: true },
  { key: 'addedAt', label: 'ストックに入った日時', group: '基本', value: (e) => e.addedAt },
  { key: 'favorite', label: 'お気に入り', group: '基本', value: (e) => (e.favorite ? 1 : 0) },
  ...FIELDER_ABILITY_KEYS.map((k) => ability(FIELDER_ABILITY_LABELS[k], k, (p) => p.fielder[k])),
  ability('賢さ', 'wisdom', (p) => p.wisdom),
  ability('球速', 'velocity', (p) => p.pitcher.velocityKmh),
  ability('クイック', 'quick', (p) => p.pitcher.quick),
  ability('制球', 'control', (p) => p.pitcher.control),
  ability('スタミナ', 'stamina', (p) => p.pitcher.stamina),
  ability('球種', 'pitches', (p) => pitchTotal(p.pitcher.pitches)),
  ...STAT_DEFINITIONS.map(
    (d): SortOption => ({
      key: `stat:${d.key}`,
      label: d.label,
      group: '通算成績',
      value: (e) => d.value(e.career),
      ...(d.lowerIsBetter ? { defaultAscending: true } : {}),
    }),
  ),
];

/** 並べ替え（値がない選手は向きにかかわらず最後。同じ値なら総合力の高い順） */
export function sortEntries(entries: readonly StockEntry[], key: string, ascending: boolean): StockEntry[] {
  const opt = SORT_OPTIONS.find((o) => o.key === key) ?? SORT_OPTIONS[0]!;
  return [...entries].sort((a, b) => {
    const va = opt.value(a);
    const vb = opt.value(b);
    if (va === null && vb === null) return calcOverall(b.player) - calcOverall(a.player);
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb), 'ja') : va - vb;
    if (cmp !== 0) return ascending ? cmp : -cmp;
    return calcOverall(b.player) - calcOverall(a.player);
  });
}
