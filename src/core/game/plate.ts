/** 1打席の抽選（ステップ1：結果の種類と球数、ステップ2：打球の行き先とアウト/セーフ） */
import {
  BASELINE,
  CONTROL_MAX,
  EXTRA_BASE,
  FATIGUE,
  FIELDER_ABILITY_MAX,
  FIELDING,
  HOME_RUN,
  PITCH_COUNT_MAX,
  PITCH_RATING_MAX,
  PITCHES_PER_PA,
  PLATE,
  VELOCITY_BASE_KMH,
  VELOCITY_MAX_KMH,
  ZONE_WEIGHTS,
} from '../config';
import { pitchTotal } from '../overall';
import type { Rng } from '../rng';
import type { Player } from '../types';
import { isOutfield, POSITIONS, type BattedType, type Position } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** 能力の上限比 − 基準値 */
const d = (value: number, max: number) => value / max - BASELINE;

/** 投手の実効能力（上限比）。球数上限超過時は低下させる */
export interface PitcherForm {
  vel: number;
  control: number;
  stuff: number;
}

export function pitcherForm(p: Player, pitchesThrown: number): PitcherForm {
  const over = Math.max(0, pitchesThrown - p.pitcher.stamina);
  const m = Math.max(FATIGUE.minMultiplier, 1 - FATIGUE.perPitchOver * over);
  return {
    vel: ((p.pitcher.velocityKmh - VELOCITY_BASE_KMH) / (VELOCITY_MAX_KMH - VELOCITY_BASE_KMH)) * m,
    control: (p.pitcher.control / CONTROL_MAX) * m,
    stuff: (pitchTotal(p.pitcher.pitches) / (PITCH_RATING_MAX * PITCH_COUNT_MAX)) * m,
  };
}

export type Step1Result = 'K' | 'BB' | BattedType;

/** ステップ1の各結果の確率（テスト・バランス検証用に公開） */
export function step1Probabilities(batter: Player, form: PitcherForm, catcher: Player) {
  const b = batter.fielder;
  const c = d(catcher.fielder.catching, FIELDER_ABILITY_MAX);
  const k = PLATE.strikeout;
  const pK = clamp(
    k.base + k.vel * (form.vel - BASELINE) + k.stuff * (form.stuff - BASELINE) - k.contact * d(b.contact, FIELDER_ABILITY_MAX) + k.catcher * c,
    k.min,
    k.max,
  );
  const w = PLATE.walk;
  const pBB = clamp(
    w.base - w.control * (form.control - BASELINE) + w.eye * d(b.contact, FIELDER_ABILITY_MAX) - w.catcher * c,
    w.min,
    w.max,
  );

  const bb = PLATE.battedBall;
  const contact = d(b.contact, FIELDER_ABILITY_MAX);
  const power = d(b.power, FIELDER_ABILITY_MAX);
  const stuff = form.stuff - BASELINE;
  const gb = Math.max(bb.minWeight, bb.groundBall.base + bb.groundBall.stuff * stuff - bb.groundBall.power * power);
  const ld = Math.max(bb.minWeight, bb.lineDrive.base + bb.lineDrive.contact * contact - bb.lineDrive.stuff * stuff);
  const fb = Math.max(bb.minWeight, bb.flyBall.base + bb.flyBall.power * power - bb.flyBall.stuff * stuff);
  const inPlay = 1 - pK - pBB;
  const sum = gb + ld + fb;
  return {
    K: pK,
    BB: pBB,
    groundBall: (inPlay * gb) / sum,
    lineDrive: (inPlay * ld) / sum,
    flyBall: (inPlay * fb) / sum,
  };
}

export function drawStep1(rng: Rng, batter: Player, form: PitcherForm, catcher: Player): Step1Result {
  const p = step1Probabilities(batter, form, catcher);
  const keys: Step1Result[] = ['K', 'BB', 'groundBall', 'lineDrive', 'flyBall'];
  return rng.weighted(keys, (key) => p[key]);
}

/** 打席の球数 */
export function drawPitchCount(rng: Rng, result: Step1Result, form: PitcherForm, batter: Player): number {
  const conf = result === 'K' ? PITCHES_PER_PA.strikeout : result === 'BB' ? PITCHES_PER_PA.walk : PITCHES_PER_PA.inPlay;
  const factor =
    1 + PITCHES_PER_PA.control * (BASELINE - form.control) + PITCHES_PER_PA.contact * d(batter.fielder.contact, FIELDER_ABILITY_MAX);
  const mean = conf.extraMean * Math.max(0.3, factor);
  const trials = PITCHES_PER_PA.trials;
  const p = clamp(mean / trials, 0, 1);
  let extra = 0;
  for (let i = 0; i < trials; i++) if (rng.next() < p) extra++;
  return conf.min + extra;
}

/** 本塁打かどうか */
export function homeRunProbability(type: BattedType, batter: Player, form: PitcherForm): number {
  if (type === 'groundBall') return 0;
  const base = type === 'flyBall' ? HOME_RUN.flyBall : HOME_RUN.lineDrive;
  const power = d(batter.fielder.power, FIELDER_ABILITY_MAX);
  const pitcher = (form.vel + form.stuff) / 2 - BASELINE;
  return clamp(base * Math.exp(HOME_RUN.power * power - HOME_RUN.pitcher * pitcher), 0, HOME_RUN.max);
}

export function drawZone(rng: Rng, type: BattedType): Position {
  const w = ZONE_WEIGHTS[type];
  return rng.weighted(POSITIONS, (pos) => w[pos]);
}

/** 打球がアウトになる確率 */
export function outProbability(type: BattedType, zone: Position, batter: Player, fielder: Player): number {
  const f = fielder.fielder;
  const b = batter.fielder;
  const M = FIELDER_ABILITY_MAX;
  if (type === 'groundBall') {
    if (isOutfield(zone)) return 0; // 内野を抜けた打球
    const g = FIELDING.groundBall;
    return clamp(
      g.base + g.fielding * d(f.fielding, M) + g.arm * d(f.arm, M) - g.speed * d(b.speed, M) - g.contact * d(b.contact, M),
      g.min,
      g.max,
    );
  }
  if (type === 'lineDrive') {
    const l = FIELDING.lineDrive;
    return clamp(
      l.base + l.catching * d(f.catching, M) + l.fielding * d(f.fielding, M) - l.contact * d(b.contact, M) - l.power * d(b.power, M),
      l.min,
      l.max,
    );
  }
  if (!isOutfield(zone)) {
    const i = FIELDING.infieldFly;
    return clamp(i.base + i.catching * d(f.catching, M), i.min, i.max);
  }
  const o = FIELDING.outfieldFly;
  return clamp(
    o.base + o.fielding * d(f.fielding, M) + o.catching * d(f.catching, M) - o.power * d(b.power, M) - o.contact * d(b.contact, M),
    o.min,
    o.max,
  );
}

/** 安打の塁打数（1〜3）。内野への打球は単打 */
export function drawHitBases(rng: Rng, type: BattedType, zone: Position, batter: Player, fielder: Player): 1 | 2 | 3 {
  if (!isOutfield(zone)) return 1;
  const e = EXTRA_BASE[type];
  const M = FIELDER_ABILITY_MAX;
  const adj = e.speed * d(batter.fielder.speed, M) - e.arm * d(fielder.fielder.arm, M) + ('power' in e ? e.power * d(batter.fielder.power, M) : 0);
  const pTriple = clamp(e.triple * (1 + 3 * d(batter.fielder.speed, M)), 0, 0.3);
  const pDouble = clamp(e.double + adj, 0, 0.8);
  const r = rng.next();
  if (r < pTriple) return 3;
  if (r < pTriple + pDouble) return 2;
  return 1;
}
