import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createRun, emptyCareer, emptyStock, playGame, showResult, type StockData } from '../core';
import { memoryStorage, openIndexedDbStorage } from './db';

describe('IndexedDB への保存', () => {
  it('進行中のプレイとストックを別々に保存・読み込みできる', async () => {
    const factory = new IDBFactory();
    const storage = await openIndexedDbStorage(factory, 'test-db');
    expect(await storage.loadPlay()).toBeNull();
    expect(await storage.loadStock()).toEqual(emptyStock());

    const run = showResult(playGame(createRun(1, 'test-run-1234')));
    await storage.savePlay(run);
    const stock: StockData = {
      entries: [{ player: run.roster[0]!, favorite: true, addedAt: '2026-11-14T00:00:00Z', career: emptyCareer() }],
    };
    await storage.saveStock(stock);

    // 開き直しても残っている
    const reopened = await openIndexedDbStorage(factory, 'test-db');
    expect(await reopened.loadPlay()).toEqual(run);
    expect(await reopened.loadStock()).toEqual(stock);

    // プレイを消してもストックは残る
    await reopened.clearPlay();
    expect(await reopened.loadPlay()).toBeNull();
    expect(await reopened.loadStock()).toEqual(stock);
  });

  it('保存時の形式より古い形式（バージョン1のプレイ）も読み込み時に変換される', async () => {
    const factory = new IDBFactory();
    const storage = await openIndexedDbStorage(factory, 'legacy-db');
    // 直接古い形式を書き込む
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = factory.open('legacy-db');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const v1 = JSON.parse(JSON.stringify(createRun(2))) as Record<string, unknown>;
    v1.version = 1;
    delete v1.runId;
    delete v1.nextSerial;
    delete v1.stockPlayerIds;
    delete v1.rematch;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('play', 'readwrite');
      tx.objectStore('play').put({ kind: 'play', version: 1, savedAt: '', run: v1 }, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const loaded = await storage.loadPlay();
    expect(loaded?.version).toBe(2);
    expect(loaded?.runId).toBe('legacy-2');
  });

  it('メモリ上の保存も同じように使える', async () => {
    const storage = memoryStorage();
    const run = createRun(3, 'memory-run-01');
    await storage.savePlay(run);
    expect(await storage.loadPlay()).toEqual(run);
  });
});
