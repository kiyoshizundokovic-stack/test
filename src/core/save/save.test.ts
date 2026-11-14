import { describe, expect, it } from 'vitest';
import { validatePlan } from '../game/plan';
import { playerId } from '../run/ids';
import { createRun, finishResult, playGame, resultOptions, showResult, startRematch } from '../run/run';
import type { RunState } from '../run/types';
import { emptyCareer, emptyStock, type StockData } from '../stock/types';
import { SAVE_VERSION, SaveFormatError } from './format';
import { makePlaySave, makeStockSave, migrateRun, parseSaveJson, readPlaySave, readStockSave } from './migrate';

/** 何試合か進めたプレイ（試合後の状態を含む） */
function playedRun(games: number): RunState {
  let s = createRun(3, 'test-run-0001');
  for (let i = 0; i < games; i++) {
    s = showResult(playGame(s));
    if (i === games - 1) return s;
    s = resultOptions(s).next ? finishResult(s) : startRematch(s);
  }
  return s;
}

/** フェーズ6（バージョン1）の形式に戻したもの */
function toV1(run: RunState): Record<string, unknown> {
  const v1 = JSON.parse(JSON.stringify(run)) as Record<string, any>;
  v1.version = 1;
  delete v1.runId;
  delete v1.nextSerial;
  delete v1.stockPlayerIds;
  delete v1.playStats;
  delete v1.rematch;
  for (const h of v1.history) delete h.rematch;
  if (v1.current) {
    delete v1.current.rematch;
    delete v1.current.opponentName;
    delete v1.current.opponentPlan;
  }
  return v1;
}

describe('選手の一意ID', () => {
  it('プレイで生成する選手（自チーム・相手）は「プレイID＋通し番号」で重複しない', () => {
    let s = createRun(1, 'abcdef12-3456');
    const seen = new Set(s.roster.map((p) => p.id));
    expect(s.roster[0]!.id).toBe(playerId('abcdef12-3456', 0));
    for (let i = 0; i < 8; i++) {
      s = showResult(playGame(s));
      for (const p of s.current!.opponent) {
        expect(p.id.startsWith('abcdef12-3456-')).toBe(true);
        expect(seen.has(p.id)).toBe(false);
        seen.add(p.id);
      }
      s = resultOptions(s).next ? finishResult(s) : resultOptions(s).rematch ? startRematch(s) : finishResult(s);
      if (s.status === 'gameover') break;
    }
    expect(s.nextSerial).toBe(seen.size);
  });

  it('プレイIDが違えば同じシードでもIDは重ならない', () => {
    const a = createRun(1, 'aaaaaaaa');
    const b = createRun(1, 'bbbbbbbb');
    expect(a.roster.map((p) => p.name)).toEqual(b.roster.map((p) => p.name)); // 中身は同じ
    expect(a.roster.some((p) => b.roster.some((q) => q.id === p.id))).toBe(false);
  });
});

describe('進行中のプレイの保存', () => {
  it('エクスポート→インポートで元に戻る（試合前・試合後・ゲーム終了の各状態）', () => {
    for (const s of [createRun(1, 'test-run-0000'), playedRun(1), playedRun(3)]) {
      const json = JSON.stringify(makePlaySave(s, '2026-11-14T00:00:00Z'));
      const back = parseSaveJson(json);
      expect(back.kind).toBe('play');
      if (back.kind === 'play') expect(back.run).toEqual(s);
    }
  });

  it('バージョン1（フェーズ6の形式）からマイグレーションでき、そのまま続きを遊べる', () => {
    for (const s of [createRun(2), playedRun(2)]) {
      const migrated = migrateRun(toV1(s));
      expect(migrated.version).toBe(3);
      expect(migrated.playStats).toEqual({});
      expect(migrated.runId).toBe(`legacy-${s.seed}`);
      expect(migrated.rematch).toBeNull();
      expect(migrated.stockPlayerIds).toEqual([]);
      expect(migrated.roster).toEqual(s.roster);
      expect(validatePlan(migrated.plan, migrated.roster)).toEqual([]);
      if (migrated.current) {
        expect(migrated.current.rematch).toBe(false);
        expect(migrated.current.opponentPlan).toEqual(s.current!.opponentPlan); // 試合結果の中の相手の作戦から復元
        expect(migrated.current.opponentName).toBe(s.current!.opponentName);
      }
      // 続きを遊べる
      let next = migrated;
      if (next.status === 'result') next = resultOptions(next).next ? finishResult(next) : startRematch(next);
      if (next.status === 'strategy') {
        next = showResult(playGame(next));
        expect(next.current!.opponent[0]!.id.startsWith('legacy-')).toBe(true);
      }
    }
  });

  it('kind のないバージョン1のエクスポート（RunState そのまま）も読み込める', () => {
    const save = readPlaySave(toV1(createRun(4)));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.run.version).toBe(3);
  });

  it('バージョン2（フェーズ7aの形式）からもマイグレーションできる（このプレイでの成績は空から）', () => {
    const v2 = JSON.parse(JSON.stringify(playedRun(2))) as Record<string, unknown>;
    v2.version = 2;
    delete v2.playStats;
    const save = readPlaySave({ kind: 'play', version: 2, savedAt: '', run: v2 });
    expect(save.run.version).toBe(3);
    expect(save.run.playStats).toEqual({});
    expect(save.run.roster).toEqual(playedRun(2).roster);
  });

  it('不正なデータはわかりやすいエラーにする', () => {
    expect(() => parseSaveJson('{not json')).toThrow(/JSONとして読み込めません/);
    expect(() => readPlaySave({ kind: 'stock', version: 2 })).toThrow(/ストックのデータです/);
    expect(() => readPlaySave({ kind: 'play', version: 99, run: {} })).toThrow(/新しいバージョン/);
    const broken = JSON.parse(JSON.stringify(makePlaySave(createRun(1), ''))) as any;
    delete broken.run.roster[0].fielder.eye;
    expect(() => readPlaySave(broken)).toThrow(SaveFormatError);
    expect(() => readPlaySave(broken)).toThrow(/fielder\.eye/);
  });
});

describe('ストックの保存', () => {
  const stockOf = (): StockData => ({
    entries: createRun(5).roster.slice(0, 3).map((player, i) => ({
      player,
      favorite: i === 0,
      addedAt: '2026-11-14T00:00:00Z',
      career: { ...emptyCareer(), plays: 2, completions: i },
    })),
  });

  it('エクスポート→インポートで元に戻る', () => {
    const stock = stockOf();
    const back = parseSaveJson(JSON.stringify(makeStockSave(stock, 'x')));
    expect(back.kind).toBe('stock');
    if (back.kind === 'stock') expect(back.stock).toEqual(stock);
    expect(readStockSave(makeStockSave(emptyStock(), 'x')).stock).toEqual(emptyStock());
  });

  it('通算成績に欠けている項目は0で補う（項目の追加に対応）', () => {
    const stock = stockOf() as any;
    delete stock.entries[0].career.batting.sbAttempts;
    delete stock.entries[0].career.pitching;
    const back = readStockSave(makeStockSave(stock, 'x')).stock;
    expect(back.entries[0]!.career.batting.sbAttempts).toBe(0);
    expect(back.entries[0]!.career.pitching).toEqual(emptyCareer().pitching);
    expect(back.entries[0]!.career.plays).toBe(2);
  });

  it('IDが重複したストック・プレイのデータは読み込まない', () => {
    const stock = stockOf();
    stock.entries[1]!.player = { ...stock.entries[1]!.player, id: stock.entries[0]!.player.id };
    expect(() => readStockSave(makeStockSave(stock, 'x'))).toThrow(/重複/);
    expect(() => readStockSave(makePlaySave(createRun(1), 'x'))).toThrow(/プレイのデータです/);
  });
});
