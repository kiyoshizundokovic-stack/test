/** 試合の構造化記録から簡易成績を集計する */
import type { GameResult, PlateAppearance } from './types';

export interface BattingLine {
  playerId: string;
  slot: number;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  r: number;
}

export interface PitchingLine {
  playerId: string;
  outs: number;
  pitches: number;
  h: number;
  r: number;
  bb: number;
  k: number;
  hr: number;
}

export interface TeamBox {
  batting: BattingLine[];
  pitching: PitchingLine[];
}

const HIT_KINDS = new Set(['1B', '2B', '3B', 'HR']);

export function isHit(pa: PlateAppearance): boolean {
  return HIT_KINDS.has(pa.kind);
}

export function isAtBat(pa: PlateAppearance): boolean {
  return pa.kind !== 'BB' && pa.kind !== 'SF';
}

export function computeBoxScore(game: GameResult): { away: TeamBox; home: TeamBox } {
  const make = (): TeamBox => ({ batting: [], pitching: [] });
  const box = { away: make(), home: make() };
  const bat = (team: TeamBox, id: string, slot: number) => {
    let l = team.batting.find((b) => b.playerId === id);
    if (!l) {
      l = { playerId: id, slot, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0 };
      team.batting.push(l);
    }
    return l;
  };
  const pit = (team: TeamBox, id: string) => {
    let l = team.pitching.find((p) => p.playerId === id);
    if (!l) {
      l = { playerId: id, outs: 0, pitches: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0 };
      team.pitching.push(l);
    }
    return l;
  };

  for (const ev of game.events) {
    if (ev.type !== 'pa') continue;
    const pa = ev.pa;
    const offense = pa.half === 'top' ? box.away : box.home;
    const defense = pa.half === 'top' ? box.home : box.away;
    const b = bat(offense, pa.batterId, pa.battingSlot);
    b.pa++;
    if (isAtBat(pa)) b.ab++;
    if (isHit(pa)) b.h++;
    if (pa.kind === 'HR') b.hr++;
    if (pa.kind === 'BB') b.bb++;
    if (pa.kind === 'K') b.k++;
    b.rbi += pa.rbi;
    // 得点（生還した走者）
    const scoredIds = pa.moves.filter((m) => m.to === 4).map((m) => m.runnerId).slice(0, pa.runs);
    for (const id of scoredIds) {
      const line = offense.batting.find((x) => x.playerId === id);
      if (line) line.r++;
    }

    const p = pit(defense, pa.pitcherId);
    p.pitches += pa.pitches;
    p.outs += pa.outsAfter - pa.outsBefore;
    if (isHit(pa)) p.h++;
    if (pa.kind === 'HR') p.hr++;
    if (pa.kind === 'BB') p.bb++;
    if (pa.kind === 'K') p.k++;
    for (const charged of pa.runsChargedTo) pit(defense, charged).r++;
  }
  for (const t of [box.away, box.home]) t.batting.sort((a, b) => a.slot - b.slot);
  return box;
}

/** 投球回の表示（例：6回1/3 → "6.1"） */
export function formatInnings(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
