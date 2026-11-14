import { describe, expect, it } from 'vitest';
import { STOCK } from '../config';
import { computeBoxScore } from '../game/stats';
import { generatePlayers } from '../generate';
import { Rng } from '../rng';
import {
  applyBossReward,
  bossRewardBlocker,
  createRun,
  finishResult,
  playGame,
  resultOptions,
  sellBlocker,
  showResult,
  startRematch,
} from '../run/run';
import type { RunState } from '../run/types';
import { collectGameStats, formatStat, statDefinition } from './career';
import {
  concludeRun,
  deleteBlocker,
  deleteEntries,
  findEntry,
  inUseIds,
  mergeStock,
  newGameBlocker,
  picksBlocker,
  renamePlayer,
  setFavorite,
  sortEntries,
  StockError,
} from './stock';
import { emptyCareer, emptyStock, type StockData } from './types';

/** ゲーム終了まで進める（通常戦の敗北・引き分けは次戦へ、ボス戦は再戦） */
function playToEnd(run: RunState, maxGames = 400): RunState {
  let s = run;
  for (let i = 0; i < maxGames && s.status !== 'gameover' && s.status !== 'finished'; i++) {
    if (s.status === 'strategy') s = showResult(playGame(s));
    else if (s.status === 'result') s = resultOptions(s).next || resultOptions(s).gameOver ? finishResult(s) : startRematch(s);
    else if (s.status === 'bossReward') s = applyBossReward(s, s.roster.find((p) => !s.stockPlayerIds.includes(p.id))!.id);
  }
  return s;
}

const stockOf = (players: ReturnType<typeof generatePlayers>): StockData => ({
  entries: players.map((player) => ({ player, favorite: false, addedAt: '2026-01-01T00:00:00Z', career: emptyCareer() })),
});

describe('1試合の成績の集計', () => {
  it('打撃・投球・失策・得点がボックススコア・スコアと一致する', () => {
    let s = createRun(7, 'stats-run-01');
    for (let g = 0; g < 6; g++) {
      s = showResult(playGame(s));
      const game = s.current!.game;
      const side = s.current!.side;
      const table = collectGameStats(game, side);
      const box = computeBoxScore(game)[side];
      const sum = (f: (t: (typeof table)[string]) => number) => Object.values(table).reduce((a, t) => a + f(t), 0);
      expect(sum((t) => t.batting.r)).toBe(game.score[side]);
      expect(sum((t) => t.batting.h)).toBe(box.hits);
      expect(sum((t) => t.batting.errors)).toBe(box.errors);
      expect(sum((t) => t.pitching.pitches)).toBe(box.pitching.reduce((a, p) => a + p.pitches, 0));
      expect(sum((t) => t.pitching.outs)).toBe(box.pitching.reduce((a, p) => a + p.outs, 0));
      expect(sum((t) => t.pitching.runs)).toBe(game.score[side === 'away' ? 'home' : 'away']);
      for (const b of box.batting) {
        const t = table[b.playerId]!;
        expect([t.batting.pa, t.batting.ab, t.batting.h, t.batting.hr, t.batting.rbi, t.batting.bb, t.batting.k, t.batting.sb]).toEqual([
          b.pa, b.ab, b.h, b.hr, b.rbi, b.bb, b.k, b.sb,
        ]);
        expect(t.batting.games).toBe(1);
      }
      for (const p of box.pitching) expect(table[p.playerId]!.pitching.appearances).toBe(1);
      // 相手の選手は含まない
      for (const id of Object.keys(table)) expect(s.roster.some((p) => p.id === id)).toBe(true);
      const o = resultOptions(s);
      s = o.next || o.gameOver ? finishResult(s) : startRematch(s);
      if (s.status !== 'strategy') break;
    }
  });

  it('プレイの成績は試合ごと（再戦を含む）に加算される', () => {
    let s = createRun(8, 'stats-run-02');
    let games = 0;
    for (let i = 0; i < 5; i++) {
      s = showResult(playGame({ ...s, life: 9 }));
      games++;
      // 敗北・引き分けは再戦、勝利は次戦へ（どちらも試合数に加算される）
      s = resultOptions(s).rematch ? startRematch(s) : finishResult(s);
      if (s.status !== 'strategy') break;
    }
    const maxGames = Math.max(...Object.values(s.playStats).map((t) => t.batting.games));
    expect(maxGames).toBe(games);
  });

  it('指標は保存した値から計算する', () => {
    const c = emptyCareer();
    c.batting = { ...c.batting, pa: 10, ab: 8, h: 3, doubles: 1, hr: 1, bb: 2 };
    c.pitching = { ...c.pitching, outs: 27, runs: 3, k: 9 };
    expect(formatStat(statDefinition('avg')!, c)).toBe('.375');
    expect(formatStat(statDefinition('obp')!, c)).toBe('.500'); // (3+2)/10
    expect(formatStat(statDefinition('slg')!, c)).toBe('.875'); // (3+1+3)/8
    expect(formatStat(statDefinition('ops')!, c)).toBe('1.375');
    expect(formatStat(statDefinition('runRate')!, c)).toBe('3.00');
    expect(formatStat(statDefinition('kRate')!, c)).toBe('9.00');
    expect(formatStat(statDefinition('avg')!, emptyCareer())).toBe('-');
  });
});

describe('ストックから連れて行った選手', () => {
  const stockPlayers = generatePlayers(new Rng(50), 3);

  it('自動生成の9人＋ストック最大3人で始まり、IDはそのまま・名前は重複しない', () => {
    const s = createRun(1, 'stock-run-01', stockPlayers);
    expect(s.roster).toHaveLength(12);
    expect(s.stockPlayerIds).toEqual(stockPlayers.map((p) => p.id));
    for (const p of stockPlayers) expect(s.roster).toContainEqual(p);
    const names = s.roster.map((p) => `${p.name.family}${p.name.given}`);
    expect(new Set(names).size).toBe(12);
    expect(() => createRun(1, 'stock-run-01', generatePlayers(new Rng(1), 4))).toThrow(/3人まで/);
  });

  it('売却できず、ボス報酬の対象に選べない', () => {
    let s = createRun(1, 'stock-run-02', stockPlayers);
    for (let seed = 0; seed < 200; seed++) {
      s = showResult(playGame({ ...createRun(1, 'stock-run-02', stockPlayers), rngState: seed, gameNumber: 10, life: 5, next: null }));
      if (s.current!.outcome === 'win') break;
    }
    expect(s.current!.outcome).toBe('win');
    expect(sellBlocker(s, stockPlayers[0]!.id)).toMatch(/ストックから連れて行った選手は売却できません/);
    s = finishResult(s);
    expect(s.status).toBe('bossReward');
    expect(bossRewardBlocker(s, stockPlayers[0]!.id)).toMatch(/強化できません/);
    expect(() => applyBossReward(s, stockPlayers[0]!.id)).toThrow();
    expect(bossRewardBlocker(s, s.roster[0]!.id)).toBeNull();
  });
});

describe('ゲーム終了時のストック', () => {
  it('連れて行った選手は自動で戻って成績が加算され、選んだ選手が新しく加わる（複製しない）', () => {
    const base = stockOf(generatePlayers(new Rng(60), 5));
    const picked = base.entries.slice(0, 2).map((e) => e.player);
    const end = playToEnd(createRun(3, 'conclude-run', picked));
    const keep = end.roster.filter((p) => !end.stockPlayerIds.includes(p.id)).slice(0, 3).map((p) => p.id);
    const stock = concludeRun(base, end, keep, '2026-11-14T00:00:00Z');
    expect(stock.entries).toHaveLength(5 + 3);
    expect(new Set(stock.entries.map((e) => e.player.id)).size).toBe(8); // 複製なし
    for (const p of picked) {
      const e = findEntry(stock, p.id)!;
      expect(e.career.plays).toBe(1);
      expect(e.career.batting).toEqual(end.playStats[p.id]?.batting ?? emptyCareer().batting);
    }
    for (const id of keep) {
      const e = findEntry(stock, id)!;
      expect(e.career.plays).toBe(1);
      expect(e.addedAt).toBe('2026-11-14T00:00:00Z');
      expect(e.player).toEqual(end.roster.find((p) => p.id === id));
    }
    // 2回目のプレイで同じ選手を連れて行くと、通算成績がさらに加算される
    const again = playToEnd(createRun(4, 'conclude-run-2', [picked[0]!]));
    const stock2 = concludeRun(stock, again, [], 'x');
    expect(findEntry(stock2, picked[0]!.id)!.career.plays).toBe(2);
    expect(stock2.entries).toHaveLength(8);
  });

  it('完走したプレイでは完走回数が増える', () => {
    const end = { ...playToEnd(createRun(5, 'finished-run')), status: 'finished' as const };
    const stock = concludeRun(emptyStock(), end, [end.roster[0]!.id], 'x');
    expect(stock.entries[0]!.career.completions).toBe(1);
  });

  it('上限200人：終了時は超えてもよいが、超えている間はニューゲームを始められない', () => {
    const big = stockOf(generatePlayers(new Rng(70), STOCK.max));
    expect(newGameBlocker(big)).toBeNull();
    const end = playToEnd(createRun(6, 'limit-run'));
    const over = concludeRun(big, end, end.roster.slice(0, 2).map((p) => p.id), 'x');
    expect(over.entries).toHaveLength(STOCK.max + 2);
    expect(newGameBlocker(over)).toMatch(/2人超えています/);
    const trimmed = deleteEntries(over, over.entries.slice(0, 2).map((e) => e.player.id), new Set()).stock;
    expect(newGameBlocker(trimmed)).toBeNull();
  });

  it('連れて行く選手の選び方の検証', () => {
    const stock = stockOf(generatePlayers(new Rng(71), 5));
    const ids = stock.entries.map((e) => e.player.id);
    expect(picksBlocker(stock, ids.slice(0, 3))).toBeNull();
    expect(picksBlocker(stock, ids.slice(0, 4))).toMatch(/3人まで/);
    expect(picksBlocker(stock, [ids[0]!, ids[0]!])).toMatch(/2回/);
    expect(picksBlocker(stock, ['unknown'])).toMatch(/いない/);
  });
});

describe('ストック一覧の操作', () => {
  const stock = stockOf(generatePlayers(new Rng(80), 6));
  const [a, b, c] = stock.entries.map((e) => e.player.id) as [string, string, string];

  it('お気に入りとプレイ中の選手は削除できない（まとめて削除でも残る）', () => {
    const fav = setFavorite(stock, a, true);
    const inUse = new Set([b]);
    expect(deleteBlocker(fav, a, inUse)).toMatch(/お気に入り/);
    expect(deleteBlocker(fav, b, inUse)).toMatch(/進行中のプレイ/);
    expect(deleteBlocker(fav, c, inUse)).toBeNull();
    const r = deleteEntries(fav, [a, b, c], inUse);
    expect(r.deleted).toBe(1);
    expect(r.skipped).toBe(2);
    expect(r.stock.entries.map((e) => e.player.id)).toContain(a);
    expect(r.stock.entries.map((e) => e.player.id)).not.toContain(c);
    expect(inUseIds(null).size).toBe(0);
  });

  it('名前を変更できる（前後の空白を除き、姓・名それぞれ1〜8文字）', () => {
    const renamed = renamePlayer(stock, a, ' 大谷 ', '翔平');
    expect(findEntry(renamed, a)!.player.name).toEqual({ family: '大谷', given: '翔平' });
    expect(() => renamePlayer(stock, a, '', '翔平')).toThrow(StockError);
    expect(() => renamePlayer(stock, a, 'あいうえおかきくけ', '翔平')).toThrow(/8文字/);
  });

  it('ソート：総合力・能力・名前・通算成績。値のない成績は最後', () => {
    const contactAsc = sortEntries(stock.entries, 'contact', true).map((e) => e.player.fielder.contact);
    expect(contactAsc).toEqual([...contactAsc].sort((x, y) => x - y));
    const withStats = { entries: stock.entries.map((e, i) => (i === 2 ? { ...e, career: { ...e.career, batting: { ...e.career.batting, ab: 10, h: 4 } } } : e)) };
    expect(sortEntries(withStats.entries, 'stat:avg', false)[0]!.player.id).toBe(c);
    expect(sortEntries(withStats.entries, 'stat:avg', true)[0]!.player.id).toBe(c); // 値があるのは1人だけ
  });

  it('読み込み（追加）：同じIDは上書き、新しい選手は追加', () => {
    const incoming: StockData = { entries: [{ ...stock.entries[0]!, favorite: true }, ...stockOf(generatePlayers(new Rng(81), 2)).entries] };
    const r = mergeStock(stock, incoming);
    expect(r.updated).toBe(1);
    expect(r.added).toBe(2);
    expect(r.stock.entries).toHaveLength(8);
    expect(findEntry(r.stock, a)!.favorite).toBe(true);
  });
});
