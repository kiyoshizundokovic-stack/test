/**
 * ゲーム全体の数値定数。
 * バランス調整・エンドレスモード（上限撤廃）に備え、能力値の上下限や生成パラメータは
 * すべてここで定義し、ロジック側にハードコードしないこと。
 */

/** 野手能力（ミート・パワー・走力・送球・守備力・捕球）の下限・上限 */
export const FIELDER_ABILITY_MIN = 1;
export const FIELDER_ABILITY_MAX = 100;

/** 球速。能力値 = km/h − VELOCITY_BASE_KMH（121km/h=1 〜 170km/h=50） */
export const VELOCITY_BASE_KMH = 120;
export const VELOCITY_MIN_KMH = 121;
export const VELOCITY_MAX_KMH = 170;

/** コントロール */
export const CONTROL_MIN = 1;
export const CONTROL_MAX = 100;

/** スタミナ = 投げられる球数そのもの */
export const STAMINA_MIN = 30;
export const STAMINA_MAX = 150;

/** 球種 */
export const PITCH_COUNT_MIN = 1;
export const PITCH_COUNT_MAX = 5;
export const PITCH_RATING_MIN = 1;
export const PITCH_RATING_MAX = 20;

/** 総合力の理論上の最大値（各能力の上限から算出。上限変更に追従する） */
export const OVERALL_MAX =
  FIELDER_ABILITY_MAX * 6 +
  (VELOCITY_MAX_KMH - VELOCITY_BASE_KMH) +
  CONTROL_MAX +
  STAMINA_MAX +
  PITCH_RATING_MAX * PITCH_COUNT_MAX;

/** チーム */
export const INITIAL_ROSTER_SIZE = 9;
export const MAX_ROSTER_SIZE = 12;
export const MIN_ROSTER_SIZE = 9;
export const INITIAL_POINTS = 500;
export const INITIAL_LIFE = 3;

/** 選手生成 */
export const PLAYER_GENERATION = {
  /** 初期選手の総合力の平均目標 */
  initialTargetOverall: 400,
  /** 選手ごとの目標総合力のばらつき（目標値に対する比率の標準偏差） */
  overallSpreadRatio: 0.12,
  /** 選手ごとの目標総合力の下限・上限（目標値に対する比率） */
  overallClampRatio: { min: 0.6, max: 1.5 },
  /** 能力ごとのばらつき（基準値に対する比率の標準偏差） */
  abilitySpreadRatio: 0.22,
  /** 球種数の決定：球種合計 / この値 を中心に ±1 程度で決める */
  pitchValuePerPitch: 12,
} as const;

/**
 * 選手のタイプ（個性）。各能力の「基準値（上限に対する比率）」への倍率。
 * 倍率は生成時に総合力が目標に合うよう正規化されるので、相対的な大小だけが意味を持つ。
 */
export type ArchetypeWeights = {
  contact: number;
  power: number;
  speed: number;
  arm: number;
  fielding: number;
  catching: number;
  velocity: number;
  control: number;
  stamina: number;
  pitches: number;
};

export const ARCHETYPES: Record<string, { label: string; weight: number; mult: ArchetypeWeights }> = {
  slugger: {
    label: '強打型',
    weight: 2,
    mult: { contact: 1.3, power: 1.6, speed: 0.8, arm: 1.0, fielding: 0.8, catching: 0.9, velocity: 0.7, control: 0.7, stamina: 0.7, pitches: 0.6 },
  },
  contact: {
    label: '巧打型',
    weight: 2,
    mult: { contact: 1.6, power: 0.8, speed: 1.3, arm: 0.9, fielding: 1.0, catching: 1.0, velocity: 0.7, control: 0.8, stamina: 0.7, pitches: 0.6 },
  },
  defense: {
    label: '守備型',
    weight: 2,
    mult: { contact: 0.8, power: 0.7, speed: 1.2, arm: 1.5, fielding: 1.6, catching: 1.5, velocity: 0.8, control: 0.8, stamina: 0.7, pitches: 0.6 },
  },
  pitcher: {
    label: '投手型',
    weight: 3,
    mult: { contact: 0.6, power: 0.6, speed: 0.7, arm: 1.1, fielding: 0.8, catching: 0.8, velocity: 1.6, control: 1.5, stamina: 1.6, pitches: 1.8 },
  },
  balanced: {
    label: 'バランス型',
    weight: 2,
    mult: { contact: 1, power: 1, speed: 1, arm: 1, fielding: 1, catching: 1, velocity: 1, control: 1, stamina: 1, pitches: 1 },
  },
};

/** 表示用ランク（パワプロ風）。下限値の降順。上限超え（エンドレス）でも S として扱う */
export const RANK_THRESHOLDS: ReadonlyArray<{ rank: string; min: number }> = [
  { rank: 'S', min: 90 },
  { rank: 'A', min: 80 },
  { rank: 'B', min: 70 },
  { rank: 'C', min: 60 },
  { rank: 'D', min: 50 },
  { rank: 'E', min: 40 },
  { rank: 'F', min: 20 },
  { rank: 'G', min: 0 },
];
