import {
  ARCHETYPES,
  CONTROL_MAX,
  CONTROL_MIN,
  FIELDER_ABILITY_MAX,
  FIELDER_ABILITY_MIN,
  OVERALL_MAX,
  OVERALL_WEIGHTS,
  PLAYER_GENERATION,
  QUICK_MAX,
  QUICK_MIN,
  STAMINA_MAX,
  STAMINA_MIN,
  VELOCITY_BASE_KMH,
  VELOCITY_MAX_KMH,
  VELOCITY_MIN_KMH,
  WISDOM_MAX,
  WISDOM_MIN,
  type ArchetypeWeights,
} from './config';
import { fullName, generateUniqueName } from './names';
import { generatePitches, PITCH_TOTAL_MAX, PITCH_TOTAL_MIN } from './pitches';
import type { Rng } from './rng';
import type { Player } from './types';

export type ArchetypeKey = keyof typeof ARCHETYPES;

export interface GeneratePlayerOptions {
  /** 目標総合力の平均（省略時は初期選手の目標値） */
  targetOverall?: number;
  /** スタミナの最低保証（相手チームの先発投手など） */
  minStamina?: number;
  /** タイプを固定する場合に指定（省略時はランダム） */
  archetype?: ArchetypeKey;
  /** 重複させたくない名前（フルネーム） */
  takenNames?: ReadonlySet<string>;
  /**
   * 選手IDの作り方。ゲームのプレイ中は「プレイID＋通し番号」で一意にする（run/ids.ts）。
   * 省略時は乱数から作る（テスト・検証スクリプト用。プレイをまたいだ一意性は保証しない）
   */
  idFactory?: () => string;
}

type Slot = keyof ArchetypeWeights;
const SLOTS: readonly Slot[] = [
  'contact', 'power', 'speed', 'arm', 'fielding', 'catching', 'eye', 'steal',
  'wisdom', 'velocity', 'quick', 'control', 'stamina', 'pitches',
];

/** 各スロットの総合力への倍率 */
function slotWeight(slot: Slot): number {
  switch (slot) {
    case 'wisdom': return OVERALL_WEIGHTS.wisdom;
    case 'velocity': return OVERALL_WEIGHTS.velocity;
    case 'quick': return OVERALL_WEIGHTS.quick;
    case 'control': return OVERALL_WEIGHTS.control;
    case 'stamina': return OVERALL_WEIGHTS.stamina;
    case 'pitches': return OVERALL_WEIGHTS.pitches;
    default: return OVERALL_WEIGHTS.fielder;
  }
}

/** 各スロットの値の範囲（球速は km/h−基準値、球種は合計値。倍率をかける前の値） */
function slotRange(slot: Slot, minStamina: number): { min: number; max: number } {
  switch (slot) {
    case 'wisdom':
      return { min: WISDOM_MIN, max: WISDOM_MAX };
    case 'velocity':
      return { min: VELOCITY_MIN_KMH - VELOCITY_BASE_KMH, max: VELOCITY_MAX_KMH - VELOCITY_BASE_KMH };
    case 'quick':
      return { min: QUICK_MIN, max: QUICK_MAX };
    case 'control':
      return { min: CONTROL_MIN, max: CONTROL_MAX };
    case 'stamina':
      return { min: Math.min(STAMINA_MAX, Math.max(STAMINA_MIN, minStamina)), max: STAMINA_MAX };
    case 'pitches':
      return { min: PITCH_TOTAL_MIN, max: PITCH_TOTAL_MAX };
    default:
      return { min: FIELDER_ABILITY_MIN, max: FIELDER_ABILITY_MAX };
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function generateId(rng: Rng): string {
  const a = rng.int(0, 0x7fffffff).toString(36);
  const b = rng.int(0, 0x7fffffff).toString(36);
  return `p_${a}${b}`;
}

/**
 * 選手を1人生成する。
 * 1. 目標総合力 P を「平均 × 正規乱数」で決める（選手ごとのばらつき。平均±40%に収める）
 * 2. タイプ（強打型・投手型など）を選び、各能力を「P の比率 × タイプ倍率 × 正規乱数」で決める
 * 3. 能力合計が P と一致するよう、タイプ倍率に比例した確率で各能力を ±1 ずつ微調整する
 */
export function generatePlayer(rng: Rng, options: GeneratePlayerOptions = {}): Player {
  const g = PLAYER_GENERATION;
  const average = options.targetOverall ?? g.initialTargetOverall;
  const minStamina = options.minStamina ?? STAMINA_MIN;

  const ranges = Object.fromEntries(SLOTS.map((s) => [s, slotRange(s, minStamina)])) as Record<
    Slot,
    { min: number; max: number }
  >;
  const weights = Object.fromEntries(SLOTS.map((s) => [s, slotWeight(s)])) as Record<Slot, number>;
  const overallMin = SLOTS.reduce((s, k) => s + ranges[k].min * weights[k], 0);

  // 1. 目標総合力
  const target = Math.round(
    clamp(
      average * clamp(rng.normal(1, g.overallSpreadRatio), g.overallClampRatio.min, g.overallClampRatio.max),
      overallMin,
      OVERALL_MAX,
    ),
  );

  // 2. タイプと各能力の初期値
  const archetypeKey =
    options.archetype ?? rng.weighted(Object.keys(ARCHETYPES), (k) => ARCHETYPES[k]!.weight);
  const mult = ARCHETYPES[archetypeKey]!.mult;
  // 倍率を「総合力への最大寄与で重み付けした平均が1」になるよう正規化
  const norm = SLOTS.reduce((s, k) => s + mult[k] * ranges[k].max * weights[k], 0) / OVERALL_MAX;
  const ratio = target / OVERALL_MAX;

  const values = {} as Record<Slot, number>;
  for (const slot of SLOTS) {
    const { min, max } = ranges[slot];
    const raw = ratio * (mult[slot] / norm) * max * rng.normal(1, g.abilitySpreadRatio);
    values[slot] = Math.round(clamp(raw, min, max));
  }

  // 3. 総合力を目標に合わせる（能力値を1ずつ動かす。倍率3の能力は総合力が3動く）
  let diff = target - SLOTS.reduce((s, k) => s + values[k] * weights[k], 0);
  for (let guard = 0; diff !== 0 && guard < 20000; guard++) {
    const step = diff > 0 ? 1 : -1;
    const movable = SLOTS.filter(
      (k) => weights[k] <= Math.abs(diff) && (step > 0 ? values[k] < ranges[k].max : values[k] > ranges[k].min),
    );
    if (movable.length === 0) break;
    // 増やすときはタイプの得意能力ほど、減らすときは苦手能力ほど選ばれやすい
    const slot = rng.weighted(movable, (k) =>
      step > 0 ? mult[k] * ranges[k].max : ranges[k].max / mult[k],
    );
    values[slot] += step;
    diff -= step * weights[slot];
  }

  const id = options.idFactory ? options.idFactory() : generateId(rng);
  const name = generateUniqueName(rng, options.takenNames ?? new Set());
  const pitches = generatePitches(rng, values.pitches, g.pitchValuePerPitch);

  return {
    id,
    name,
    fielder: {
      contact: values.contact,
      power: values.power,
      speed: values.speed,
      arm: values.arm,
      fielding: values.fielding,
      catching: values.catching,
      eye: values.eye,
      steal: values.steal,
    },
    wisdom: values.wisdom,
    pitcher: {
      velocityKmh: values.velocity + VELOCITY_BASE_KMH,
      quick: values.quick,
      control: values.control,
      stamina: values.stamina,
      pitches,
    },
    traits: [],
  };
}

/** 名前が重複しない選手を count 人生成する */
export function generatePlayers(
  rng: Rng,
  count: number,
  options: Omit<GeneratePlayerOptions, 'takenNames'> = {},
): Player[] {
  const taken = new Set<string>();
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const p = generatePlayer(rng, { ...options, takenNames: taken });
    taken.add(fullName(p.name));
    players.push(p);
  }
  return players;
}
