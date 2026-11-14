/**
 * セーブデータの保存先（SPEC 6）。ブラウザの IndexedDB に「進行中のプレイ」と「ストック」を別々に保存する。
 * 読み込み時は core/save のマイグレーション・検証を通す。UI 層のモジュール（core からは使わない）。
 */
import {
  emptyStock,
  makePlaySave,
  makeStockSave,
  readPlaySave,
  readStockSave,
  type RunState,
  type StockData,
} from '../core';

export interface SaveStorage {
  /** 進行中のプレイ（なければ null） */
  loadPlay(): Promise<RunState | null>;
  savePlay(run: RunState): Promise<void>;
  clearPlay(): Promise<void>;
  /** ストック（なければ空） */
  loadStock(): Promise<StockData>;
  saveStock(stock: StockData): Promise<void>;
}

export const DB_NAME = 'baseball-roguelike';
/** IndexedDB のスキーマのバージョン（保存先の追加・変更時に上げる。セーブデータの形式のバージョンとは別） */
export const DB_VERSION = 1;
const PLAY_STORE = 'play';
const STOCK_STORE = 'stock';
const PLAY_KEY = 'current';
const STOCK_KEY = 'main';

const now = () => new Date().toISOString();

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PLAY_STORE)) db.createObjectStore(PLAY_STORE);
      if (!db.objectStoreNames.contains(STOCK_STORE)) db.createObjectStore(STOCK_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('データベースを開けません（別のタブで開いている可能性があります）'));
  });
}

export async function openIndexedDbStorage(factory: IDBFactory = indexedDB, name: string = DB_NAME): Promise<SaveStorage> {
  const db = await openDb(factory, name);
  const get = (store: string, key: string) => request(db.transaction(store, 'readonly').objectStore(store).get(key));
  const put = async (store: string, key: string, value: unknown) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    async loadPlay() {
      const raw = await get(PLAY_STORE, PLAY_KEY);
      return raw === undefined ? null : readPlaySave(raw).run;
    },
    savePlay: (run) => put(PLAY_STORE, PLAY_KEY, makePlaySave(run, now())),
    async clearPlay() {
      const tx = db.transaction(PLAY_STORE, 'readwrite');
      await request(tx.objectStore(PLAY_STORE).delete(PLAY_KEY));
    },
    async loadStock() {
      const raw = await get(STOCK_STORE, STOCK_KEY);
      return raw === undefined ? emptyStock() : readStockSave(raw).stock;
    },
    saveStock: (stock) => put(STOCK_STORE, STOCK_KEY, makeStockSave(stock, now())),
  };
}

/** IndexedDB が使えない環境（一部のプライベートブラウズなど）用。保存はページを閉じるまで */
export function memoryStorage(): SaveStorage {
  let play: unknown = undefined;
  let stock: unknown = undefined;
  return {
    loadPlay: async () => (play === undefined ? null : readPlaySave(play).run),
    savePlay: async (run) => void (play = JSON.parse(JSON.stringify(makePlaySave(run, now())))),
    clearPlay: async () => void (play = undefined),
    loadStock: async () => (stock === undefined ? emptyStock() : readStockSave(stock).stock),
    saveStock: async (s) => void (stock = JSON.parse(JSON.stringify(makeStockSave(s, now())))),
  };
}

/** IndexedDB を開き、使えなければメモリ上の保存に切り替える */
export async function openStorage(): Promise<{ storage: SaveStorage; persistent: boolean }> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB がありません');
    return { storage: await openIndexedDbStorage(), persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}
