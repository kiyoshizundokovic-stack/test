/** 試合の構造化記録から簡易成績を集計する */
import type { ErrorRecord, GameResult, PlateAppearance, Position } from './types';

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
  /** 盗塁・盗塁死 */
  sb: number;
  cs: number;
  /** 失策による出塁 */
  roe: number;
}

export interface PitchingLine {
  playerId: string;
  outs: number;
  pitches: number;
  h: number;
  /** 失点（自責点は区別しない） */
  r: number;
  bb: number;
  k: number;
  hr: number;
}

export interface FieldingLine {
  playerId: string;
  /** 失策 */
  e: number;
  /** 失策した守備位置ごとの数 */
  byPosition: Partial<Record<Position, number>>;
}

export interface TeamBox {
  batting: BattingLine[];
  pitching: PitchingLine[];
  fielding: FieldingLine[];
  hits: number;
  errors: number;
}

const HIT_KINDS = new Set(['1B', '2B', '3B', 'HR']);

export function isHit(pa: PlateAppearance): boolean {
  return HIT_KINDS.has(pa.kind);
}

/** 打数に数える打席（四球・犠飛以外。失策による出塁は打数1・安打0） */
export function isAtBat(pa: PlateAppearance): boolean {
  return pa.kind !== 'BB' && pa.kind !== 'SF';
}

export function computeBoxScore(game: GameResult): { away: TeamBox; home: TeamBox } {
  const make = (): TeamBox => ({ batting: [], pitching: [], fielding: [], hits: 0, errors: 0 });
  const box = { away: make(), home: make() };
  const slotOf = new Map<string, number>();
  const bat = (team: TeamBox, id: string) => {
    let l = team.batting.find((b) => b.playerId === id);
    if (!l) {
      l = { playerId: id, slot: slotOf.get(id) ?? 9, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0, sb: 0, cs: 0, roe: 0 };
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
  const fieldError = (team: TeamBox, err: ErrorRecord) => {
    let l = team.fielding.find((f) => f.playerId === err.playerId);
    if (!l) {
      l = { playerId: err.playerId, e: 0, byPosition: {} };
      team.fielding.push(l);
    }
    l.e++;
    l.byPosition[err.position] = (l.byPosition[err.position] ?? 0) + 1;
    team.errors++;
  };
  const scoreRuns = (team: TeamBox, moves: { runnerId: string; to: number }[], runs: number) => {
    const scoredIds = moves.filter((m) => m.to === 4).map((m) => m.runnerId).slice(0, runs);
    for (const id of scoredIds) bat(team, id).r++;
  };

  for (const ev of game.events) {
    if (ev.type === 'stage') continue;
    if (ev.type === 'steal') {
      const st = ev.steal;
      const offense = st.half === 'top' ? box.away : box.home;
      const defense = st.half === 'top' ? box.home : box.away;
      const b = bat(offense, st.runnerId);
      if (st.success) b.sb++;
      else b.cs++;
      scoreRuns(offense, st.moves, st.runs);
      for (const err of st.errors) fieldError(defense, err);
      const p = pit(defense, st.pitcherId);
      p.outs += st.outsAfter - st.outsBefore;
      for (const charged of st.runsChargedTo) pit(defense, charged).r++;
      continue;
    }
    const pa = ev.pa;
    const offense = pa.half === 'top' ? box.away : box.home;
    const defense = pa.half === 'top' ? box.home : box.away;
    if (!slotOf.has(pa.batterId)) slotOf.set(pa.batterId, pa.battingSlot);
    const b = bat(offense, pa.batterId);
    b.slot = Math.min(b.slot, pa.battingSlot);
    b.pa++;
    if (isAtBat(pa)) b.ab++;
    if (isHit(pa)) {
      b.h++;
      offense.hits++;
    }
    if (pa.kind === 'HR') b.hr++;
    if (pa.kind === 'BB') b.bb++;
    if (pa.kind === 'K') b.k++;
    if (pa.kind === 'E') b.roe++;
    b.rbi += pa.rbi;
    scoreRuns(offense, pa.moves, pa.runs);
    for (const err of pa.errors) fieldError(defense, err);

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
