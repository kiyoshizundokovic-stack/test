/**
 * セーブデータの形式（SPEC 6）。「進行中のプレイ」と「ストック」を別々に保存・エクスポートする。
 * どちらも { kind, version, savedAt, data } の形。version を上げたら migrate.ts に変換を追加する。
 */
import type { RunState } from '../run/types';
import type { StockData } from '../stock/types';

/** セーブデータ（エクスポートのJSONも同じ形）のバージョン */
export const SAVE_VERSION = 4;

export interface PlaySave {
  kind: 'play';
  version: typeof SAVE_VERSION;
  savedAt: string;
  run: RunState;
}

export interface StockSave {
  kind: 'stock';
  version: typeof SAVE_VERSION;
  savedAt: string;
  stock: StockData;
}

export class SaveFormatError extends Error {}
