/**
 * バランス検証用の作戦ボット（ゲームの仕様ではなく、分析専用）。
 * - optimizedPlan：上手なプレイヤーを想定した作戦（能力に合った投手・野手の選択、守備配置の最適割り当て、出塁型を上位にする打順）
 * - randomPlan：敵AIの選手選択はそのままで、打順と守備配置をランダムにした作戦
 */
import { BASELINE, FIELDER_ABILITY_MAX, WISDOM_MAX, ZONE_WEIGHTS } from '../config';
import { buildAutoPlan, pitchingScore } from '../game/plan';
import { POSITIONS, type GamePlan, type Position, type Stage } from '../game/types';
import type { Rng } from '../rng';
import type { Player } from '../types';

/** 野手の守備位置（投手以外の8つ） */
export const FIELD_POSITIONS = POSITIONS.filter((p): p is Exclude<Position, 'P'> => p !== 'P');
type FieldPos = (typeof FIELD_POSITIONS)[number];

/** 打球種類の構成比（バランス検証の実測値：ゴロ49%・ライナー20%・フライ31%） */
const BATTED_MIX = { groundBall: 0.49, lineDrive: 0.2, flyBall: 0.31 } as const;

const zoneShare = (type: keyof typeof BATTED_MIX, pos: Position) => {
  const w = ZONE_WEIGHTS[type];
  const total = POSITIONS.reduce((s, p) => s + w[p], 0);
  return w[pos] / total;
};
const n = (v: number) => v / FIELDER_ABILITY_MAX - BASELINE;
const OUTFIELD = new Set<Position>(['LF', 'CF', 'RF']);

/**
 * 守備位置 pos での守備の価値（試合エンジンの式の係数を、その位置に飛ぶ打球の割合で重み付けした近似値）。
 * 守備者の走力（守備範囲。外野で大きめ）も含む。
 * アウト率への寄与に加え、エラー（捕球・送球）と捕手の盗塁阻止も含める。
 */
export function fieldingValue(p: Player, pos: FieldPos): number {
  const f = p.fielder;
  const wis = p.wisdom / WISDOM_MAX - BASELINE;
  let v = 0;
  // ゴロ：内野はアウト率（守備・送球）とエラー（捕球・送球）、外野は長打の抑制（送球）
  const gb = BATTED_MIX.groundBall * zoneShare('groundBall', pos);
  v += OUTFIELD.has(pos)
    ? gb * 0.1 * n(f.arm)
    : gb * (0.3 * n(f.fielding) + 0.08 * n(f.speed) + 0.2 * n(f.arm) + 0.04 * wis + 0.12 * n(f.catching) + 0.08 * n(f.arm));
  // ライナー：捕球（＋守備）
  const ld = BATTED_MIX.lineDrive * zoneShare('lineDrive', pos);
  v += ld * (0.3 * n(f.catching) + 0.15 * n(f.fielding) + (OUTFIELD.has(pos) ? 0.1 : 0.04) * n(f.speed) + 0.04 * wis);
  // フライ：外野は守備・捕球と長打の抑制（送球）、内野は捕球
  const fb = BATTED_MIX.flyBall * zoneShare('flyBall', pos);
  v += OUTFIELD.has(pos)
    ? fb * (0.25 * n(f.fielding) + 0.18 * n(f.speed) + 0.2 * n(f.catching) + 0.04 * wis + 0.15 * n(f.arm))
    : fb * 0.1 * n(f.catching);
  // 一塁：内野ゴロの送球を受ける
  if (pos === '1B') v += BATTED_MIX.groundBall * 0.6 * 0.06 * n(f.catching);
  // 捕手：盗塁阻止（送球・賢さ）と本塁での送球の受け
  if (pos === 'C') v += 0.06 * n(f.arm) + 0.02 * wis + 0.02 * n(f.catching);
  return v;
}

/** 打撃の価値（得点への寄与の近似。打撃のバランス検証の式の係数に基づく重み） */
export function battingValue(p: Player): number {
  const f = p.fielder;
  return 0.35 * n(f.contact) + 0.3 * n(f.power) + 0.15 * n(f.eye) + 0.1 * n(f.speed) + 0.05 * n(f.steal) + 0.05 * (p.wisdom / WISDOM_MAX - BASELINE);
}

/** 出塁の価値（1番打者の選び方に使う） */
export function onBaseValue(p: Player): number {
  const f = p.fielder;
  return 0.45 * n(f.contact) + 0.4 * n(f.eye) + 0.15 * n(f.speed);
}

/** 8人を8つの守備位置に割り当てる最適解（ビットマスクDP。守備の価値の合計が最大） */
export function bestAssignment(fielders: readonly Player[]): { total: number; positions: Record<FieldPos, string> } {
  const k = FIELD_POSITIONS.length;
  if (fielders.length !== k) throw new Error('bestAssignment: 8人必要');
  const value = fielders.map((p) => FIELD_POSITIONS.map((pos) => fieldingValue(p, pos)));
  const size = 1 << k;
  const dp = new Float64Array(size).fill(-Infinity);
  const choice = new Int8Array(size).fill(-1);
  dp[0] = 0;
  for (let mask = 0; mask < size; mask++) {
    if (dp[mask] === -Infinity) continue;
    const i = popcount(mask); // i 番目の選手を割り当てる
    if (i >= k) continue;
    for (let j = 0; j < k; j++) {
      if (mask & (1 << j)) continue;
      const next = mask | (1 << j);
      const v = dp[mask]! + value[i]![j]!;
      if (v > dp[next]!) {
        dp[next] = v;
        choice[next] = j;
      }
    }
  }
  const positions = {} as Record<FieldPos, string>;
  let mask = size - 1;
  for (let i = k - 1; i >= 0; i--) {
    const j = choice[mask]!;
    positions[FIELD_POSITIONS[j]!] = fielders[i]!.id;
    mask &= ~(1 << j);
  }
  return { total: dp[size - 1]!, positions };
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** 1試合で必要な球数の目安（バランス検証の実測：1チーム約140球） */
const PITCHES_PER_GAME = 140;

/**
 * 投手陣の価値：投手の質（pitchingScore）× 投げる球数。質の高い順に、各投手のスタミナまで球数を割り当てる。
 * 全員のスタミナを足しても足りなければ、最後の投手が疲労して投げる分を割り引く。
 */
export function pitchingStaff(pitchers: readonly Player[]): { value: number; order: Player[] } {
  const order = [...pitchers].sort((a, b) => pitchingScore(b) - pitchingScore(a));
  let left = PITCHES_PER_GAME;
  let value = 0;
  for (const p of order) {
    const pitches = Math.min(left, p.pitcher.stamina);
    value += pitchingScore(p) * pitches;
    left -= pitches;
  }
  if (left > 0) value += pitchingScore(order[order.length - 1]!) * left * 0.6;
  // 先発は球数の多い投手にする（継投は球数で交代するため、質が近ければ長く投げられる投手から）
  const starter = order.reduce((best, p) =>
    pitchingScore(p) * Math.min(p.pitcher.stamina, PITCHES_PER_GAME) > pitchingScore(best) * Math.min(best.pitcher.stamina, PITCHES_PER_GAME)
      ? p
      : best,
  );
  return { value: value / PITCHES_PER_GAME, order: [starter, ...order.filter((p) => p !== starter)] };
}

export interface OptimizeWeights {
  /** 投手陣の価値の重み（守備・打撃との相対） */
  pitching: number;
  /** 打撃の価値の重み */
  batting: number;
  /** 守備の価値の重み */
  fielding: number;
}

/**
 * 重み。敵AIとの対戦（各1500試合）で投手0〜2・守備0〜8の範囲を試したが、勝率の差は±1%程度（誤差の範囲）だった。
 * 作戦の良し悪しが勝率に与える影響自体が小さいため（docs/balance-report.md）、中庸な値にしている。
 */
export const DEFAULT_OPTIMIZE_WEIGHTS: OptimizeWeights = { pitching: 0.6, batting: 1, fielding: 3 };

/**
 * 上手なプレイヤーを想定した作戦。
 * 1. 投手陣（先発＋控え全員＝ロースター−8人）を、投手能力の上位候補の組み合わせから選ぶ
 * 2. 残り8人の守備位置を最適に割り当てる
 * 3. 「投手陣の価値＋野手の打撃・守備の価値」が最大の組み合わせを採用
 * 4. 打順：打撃上位5人のうち出塁型を1番、長打型を4番、残りを2・3・5番。6〜9番は打撃順（投手は9番になりやすい）
 * 5. 継投：控え投手を質の高い順に登板させ、投手の打順・守備位置を引き継ぐ
 */
export function optimizedPlan(players: readonly Player[], weights: OptimizeWeights = DEFAULT_OPTIMIZE_WEIGHTS): GamePlan {
  if (players.length < 9) throw new Error('optimizedPlan: 9人以上必要');
  const k = players.length - 8; // 投手の人数（先発＋控え）
  const candidates = [...players].sort((a, b) => pitchingScore(b) - pitchingScore(a)).slice(0, Math.min(players.length, k + 2));
  let best: { score: number; staff: Player[]; positions: Record<FieldPos, string>; fielders: Player[] } | null = null;
  for (const staff of combinations(candidates, k)) {
    const fielders = players.filter((p) => !staff.includes(p));
    const { total, positions } = bestAssignment(fielders);
    const { value, order } = pitchingStaff(staff);
    const score =
      weights.pitching * value + weights.fielding * total + weights.batting * (fielders.reduce((s, p) => s + battingValue(p), 0) + battingValue(order[0]!));
    if (!best || score > best.score) best = { score, staff: order, positions, fielders };
  }
  const { staff, positions, fielders } = best!;
  const starter = staff[0]!;

  // 打順
  const hitters = [starter, ...fielders].sort((a, b) => battingValue(b) - battingValue(a));
  const top5 = hitters.slice(0, 5);
  const leadoff = top5.reduce((a, b) => (onBaseValue(b) > onBaseValue(a) ? b : a));
  const rest5 = top5.filter((p) => p !== leadoff);
  const cleanup = rest5.reduce((a, b) => (b.fielder.power > a.fielder.power ? b : a));
  const others = rest5.filter((p) => p !== cleanup); // 打撃順
  const lineupPlayers = [leadoff, others[0]!, others[1]!, cleanup, others[2]!, ...hitters.slice(5)];
  const lineup = lineupPlayers.map((p) => p.id);

  const stages: Stage[] = [{ lineup, positions: { P: starter.id, ...positions } }];
  for (const r of staff.slice(1)) {
    const prev = stages[stages.length - 1]!;
    const slot = prev.lineup.indexOf(prev.positions.P);
    const nextLineup = [...prev.lineup];
    nextLineup[slot] = r.id;
    stages.push({ lineup: nextLineup, positions: { ...prev.positions, P: r.id } });
  }
  return { stages };
}

function* combinations<T>(items: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]!);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

/** 敵AIの選手選択（先発・控え投手・野手8人）はそのままで、打順と野手の守備位置をランダムにする */
export function randomPlan(players: readonly Player[], rng: Rng): GamePlan {
  const ai = buildAutoPlan(players);
  const first = ai.stages[0]!;
  const fielders = rng.shuffle(FIELD_POSITIONS.map((pos) => first.positions[pos]));
  const positions = { ...first.positions };
  FIELD_POSITIONS.forEach((pos, i) => (positions[pos] = fielders[i]!));
  const lineup = rng.shuffle(first.lineup);
  const stages: Stage[] = [{ lineup, positions }];
  for (const st of ai.stages.slice(1)) {
    const prev = stages[stages.length - 1]!;
    const slot = prev.lineup.indexOf(prev.positions.P);
    const nextLineup = [...prev.lineup];
    nextLineup[slot] = st.positions.P;
    stages.push({ lineup: nextLineup, positions: { ...prev.positions, P: st.positions.P } });
  }
  return { stages };
}
