/** 選手データ型。React 非依存・JSON シリアライズ可能な形に保つこと（セーブデータに直接入る） */

export const PITCH_TYPES = [
  'straight',
  'sinker',
  'changeup',
  'curve',
  'slowCurve',
  'slider',
  'cutter',
  'sweeper',
  'splitter',
  'knuckle',
] as const;

export type PitchType = (typeof PITCH_TYPES)[number];

export const PITCH_LABELS: Record<PitchType, string> = {
  straight: 'ストレート',
  sinker: 'シンカー',
  changeup: 'チェンジアップ',
  curve: 'カーブ',
  slowCurve: 'スローカーブ',
  slider: 'スライダー',
  cutter: 'カッター',
  sweeper: 'スイーパー',
  splitter: 'スプリッター',
  knuckle: 'ナックル',
};

export interface Pitch {
  type: PitchType;
  /** 評価値（PITCH_RATING_MIN〜PITCH_RATING_MAX） */
  rating: number;
}

/** 野手能力（各 FIELDER_ABILITY_MIN〜MAX） */
export interface FielderAbilities {
  /** ミート */
  contact: number;
  /** パワー */
  power: number;
  /** 走力 */
  speed: number;
  /** 送球 */
  arm: number;
  /** 守備力 */
  fielding: number;
  /** 捕球 */
  catching: number;
}

export const FIELDER_ABILITY_KEYS = ['contact', 'power', 'speed', 'arm', 'fielding', 'catching'] as const;
export type FielderAbilityKey = (typeof FIELDER_ABILITY_KEYS)[number];

export const FIELDER_ABILITY_LABELS: Record<FielderAbilityKey, string> = {
  contact: 'ミート',
  power: 'パワー',
  speed: '走力',
  arm: '送球',
  fielding: '守備',
  catching: '捕球',
};

/** 投手能力 */
export interface PitcherAbilities {
  /** 球速（km/h。VELOCITY_MIN_KMH〜MAX）。能力値としては km/h − VELOCITY_BASE_KMH */
  velocityKmh: number;
  /** コントロール */
  control: number;
  /** スタミナ（投げられる球数そのもの） */
  stamina: number;
  /** 所持球種。先頭は必ずストレート。重複なし */
  pitches: Pitch[];
}

export interface PlayerName {
  family: string;
  given: string;
}

export interface Player {
  id: string;
  name: PlayerName;
  fielder: FielderAbilities;
  pitcher: PitcherAbilities;
  /** 特殊能力（将来の拡張用。現在は常に空配列） */
  traits: string[];
}
