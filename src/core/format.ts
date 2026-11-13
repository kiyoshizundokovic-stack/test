import { QUICK_RANK_SCALE, RANK_THRESHOLDS } from './config';
import { fullName } from './names';
import { calcOverall } from './overall';
import { FIELDER_ABILITY_KEYS, FIELDER_ABILITY_LABELS, PITCH_LABELS, type Pitch, type Player } from './types';

/** パワプロ風ランク（S〜G）。上限超えの値でも S を返す */
export function rankOf(value: number): string {
  return RANK_THRESHOLDS.find((t) => value >= t.min)?.rank ?? 'G';
}

/** クイック（1〜50）のランク */
export function quickRankOf(value: number): string {
  return rankOf(value * QUICK_RANK_SCALE);
}

/** 表示幅（全角=2, 半角=1） */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 1 : 2;
  return w;
}

export function padEnd(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}

export function padStart(s: string, width: number): string {
  return ' '.repeat(Math.max(0, width - displayWidth(s))) + s;
}

export function formatPitches(pitches: readonly Pitch[]): string {
  return pitches.map((p) => `${PITCH_LABELS[p.type]}${p.rating}`).join(' ');
}

/** 能力表（等幅フォント前提のテキスト） */
export function formatPlayerTable(players: readonly Player[]): string {
  const header = [
    padEnd('名前', 14),
    padStart('総合', 5),
    ...FIELDER_ABILITY_KEYS.map((k) => padStart(FIELDER_ABILITY_LABELS[k], 7)),
    padStart('賢さ', 7),
    padStart('球速', 7),
    padStart('ｸｲｯｸ', 5),
    padStart('制球', 6),
    padStart('スタ', 4),
    padStart('球種計', 6),
    '  球種',
  ].join(' ');

  const rows = players.map((p) => {
    const f = p.fielder;
    const pt = p.pitcher;
    const pitchSum = pt.pitches.reduce((s, x) => s + x.rating, 0);
    const ability = (v: number) => padStart(`${rankOf(v)} ${v}`, 7);
    return [
      padEnd(fullName(p.name), 14),
      padStart(String(calcOverall(p)), 5),
      ...FIELDER_ABILITY_KEYS.map((k) => ability(f[k])),
      ability(p.wisdom),
      padStart(`${pt.velocityKmh}km`, 7),
      padStart(`${quickRankOf(pt.quick)} ${pt.quick}`, 5),
      padStart(`${rankOf(pt.control)} ${pt.control}`, 6),
      padStart(String(pt.stamina), 4),
      padStart(String(pitchSum), 6),
      `  ${formatPitches(pt.pitches)}`,
    ].join(' ');
  });

  const avg = players.length ? players.reduce((s, p) => s + calcOverall(p), 0) / players.length : 0;
  return [header, '-'.repeat(displayWidth(header)), ...rows, '', `平均総合力: ${avg.toFixed(1)}`].join('\n');
}
