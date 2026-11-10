/** 試合エンジン（SPEC 3）。React非依存。同じシード・同じ入力なら同じ結果になる */
import { BASELINE, FIELDER_ABILITY_MAX, GAME_INNINGS, OUTS_PER_INNING, RUNNING } from '../config';
import { Rng } from '../rng';
import type { Player } from '../types';
import {
  drawHitBases,
  drawPitchCount,
  drawStep1,
  drawZone,
  homeRunProbability,
  outProbability,
  pitcherForm,
} from './plate';
import { validatePlan } from './plan';
import type { RuleKey } from './runnerTable';
import { applyPlay, type Bases, type Runner } from './runners';
import {
  isOutfield,
  POSITIONS,
  type GameEvent,
  type GameResult,
  type Half,
  type PlateAppearance,
  type PlayKind,
  type Position,
  type StageChange,
  type TeamEntry,
} from './types';

type SideKey = 'away' | 'home';

interface SideState {
  entry: TeamEntry;
  players: Map<string, Player>;
  stageIndex: number;
  nextSlot: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function doublePlayProbability(fielder: Player, batter: Player, runner: Player): number {
  const c = RUNNING.doublePlay;
  const d = (v: number) => v / FIELDER_ABILITY_MAX - BASELINE;
  return clamp(
    c.base + c.arm * d(fielder.fielder.arm) - c.speed * d(batter.fielder.speed) - c.runnerSpeed * d(runner.fielder.speed),
    c.min,
    c.max,
  );
}

export function simulateGame(away: TeamEntry, home: TeamEntry, seed: number): GameResult {
  for (const [label, team] of [['away', away], ['home', home]] as const) {
    const errors = validatePlan(team.plan, team.players);
    if (errors.length > 0) throw new Error(`${label} の作戦が不正: ${errors.join(' / ')}`);
  }

  const rng = new Rng(seed);
  const sides: Record<SideKey, SideState> = {
    away: { entry: away, players: new Map(away.players.map((p) => [p.id, p])), stageIndex: 0, nextSlot: 0 },
    home: { entry: home, players: new Map(home.players.map((p) => [p.id, p])), stageIndex: 0, nextSlot: 0 },
  };
  const pitchCounts = new Map<string, number>();
  const events: GameEvent[] = [];
  const score = { away: 0, home: 0 };
  const lineScore: GameResult['lineScore'] = { away: [], home: [] };
  let walkOff = false;

  const player = (side: SideState, id: string): Player => {
    const p = side.players.get(id);
    if (!p) throw new Error(`unknown player ${id}`);
    return p;
  };
  const stageOf = (side: SideState) => side.entry.plan.stages[side.stageIndex]!;

  /** 投手が球数上限に達していれば次の段階へ（最後の段階ならそのまま続投） */
  const maybeAdvanceStage = (key: SideKey, inning: number, half: Half) => {
    const side = sides[key];
    const stages = side.entry.plan.stages;
    while (side.stageIndex < stages.length - 1) {
      const prev = stageOf(side);
      const pitcher = player(side, prev.positions.P);
      if ((pitchCounts.get(pitcher.id) ?? 0) < pitcher.pitcher.stamina) break;
      side.stageIndex++;
      const next = stageOf(side);
      const prevPos = new Map<string, Position>(POSITIONS.map((pos) => [prev.positions[pos], pos]));
      const change: StageChange = {
        inning,
        half,
        team: key,
        stageIndex: side.stageIndex,
        substitutions: [],
        positionChanges: [],
      };
      next.lineup.forEach((id, slot) => {
        if (prev.lineup[slot] !== id) change.substitutions.push({ slot, outId: prev.lineup[slot]!, inId: id });
      });
      for (const pos of POSITIONS) {
        const id = next.positions[pos];
        if (prevPos.get(id) !== pos) change.positionChanges.push({ playerId: id, from: prevPos.get(id) ?? null, to: pos });
      }
      events.push({ type: 'stage', change });
    }
  };

  game: for (let inning = 1; inning <= GAME_INNINGS; inning++) {
    for (const half of ['top', 'bottom'] as const) {
      const offKey: SideKey = half === 'top' ? 'away' : 'home';
      const defKey: SideKey = half === 'top' ? 'home' : 'away';
      if (half === 'bottom' && inning === GAME_INNINGS && score.home > score.away) {
        lineScore.home.push(null);
        break game;
      }
      const off = sides[offKey];
      const def = sides[defKey];
      let outs = 0;
      let bases: Bases = [null, null, null];
      let inningRuns = 0;

      while (outs < OUTS_PER_INNING) {
        maybeAdvanceStage(defKey, inning, half);
        const defStage = stageOf(def);
        const offStage = stageOf(off);
        const slot = off.nextSlot;
        const batter = player(off, offStage.lineup[slot]!);
        const pitcher = player(def, defStage.positions.P);
        const catcher = player(def, defStage.positions.C);
        const thrown = pitchCounts.get(pitcher.id) ?? 0;
        const form = pitcherForm(pitcher, thrown);

        const step1 = drawStep1(rng, batter, form, catcher);
        const pitches = drawPitchCount(rng, step1, form);
        pitchCounts.set(pitcher.id, thrown + pitches);

        let key: RuleKey;
        let zone: Position | 'HR' | undefined;
        let fielder: Player = catcher;
        if (step1 === 'K' || step1 === 'BB') {
          key = step1;
        } else if (rng.next() < homeRunProbability(step1, batter, form)) {
          key = 'HR';
          zone = 'HR';
        } else {
          const z = drawZone(rng, step1);
          zone = z;
          fielder = player(def, defStage.positions[z]);
          const out = rng.next() < outProbability(step1, z, batter, fielder);
          if (out) {
            if (step1 === 'groundBall') {
              const r1 = bases[0];
              if (r1 && outs < OUTS_PER_INNING - 1) {
                key = rng.next() < doublePlayProbability(fielder, batter, player(off, r1.id)) ? 'DP' : 'FC';
              } else key = 'GO';
            } else if (step1 === 'lineDrive') key = 'LO';
            else key = isOutfield(z) ? 'FO' : 'FO_IF';
          } else {
            const hit = drawHitBases(rng, step1, z, batter, fielder);
            key = hit === 3 ? '3B' : hit === 2 ? '2B' : isOutfield(z) ? '1B' : '1B_IF';
          }
        }

        const batterRunner: Runner = { id: batter.id, pitcherId: pitcher.id };
        const basesBefore = bases.map((r) => r?.id ?? null);
        const outsBefore = outs;
        const outcome = applyPlay(rng, key, { bases, outs }, batterRunner, fielder, (id) => player(off, id));

        let scored = outcome.scored;
        // サヨナラ：本塁打以外は勝ち越し点まで
        const lastHalf = half === 'bottom' && inning === GAME_INNINGS;
        if (lastHalf && score.home + scored.length > score.away) {
          walkOff = true;
          if (key !== 'HR') scored = scored.slice(0, score.away - score.home + 1);
        }

        let kind: PlayKind =
          key === '1B_IF' ? '1B' : key === 'FO_IF' ? 'FO' : key;
        if (key === 'FO' && outsBefore < 2 && scored.length > 0) kind = 'SF';

        score[offKey] += scored.length;
        inningRuns += scored.length;
        outs = outcome.outs;
        bases = outcome.bases;

        const pa: PlateAppearance = {
          inning,
          half,
          battingSlot: slot,
          batterId: batter.id,
          pitcherId: pitcher.id,
          outsBefore,
          basesBefore,
          kind,
          ...(step1 !== 'K' && step1 !== 'BB' ? { battedType: step1 } : {}),
          ...(zone !== undefined ? { zone } : {}),
          ...(zone !== undefined && zone !== 'HR' ? { fielderId: fielder.id } : {}),
          pitches,
          moves: outcome.moves,
          runs: scored.length,
          rbi: kind === 'DP' ? 0 : scored.length,
          runsChargedTo: scored.map((r) => r.pitcherId),
          outsAfter: outs,
          basesAfter: bases.map((r) => r?.id ?? null),
          scoreAfter: { ...score },
        };
        events.push({ type: 'pa', pa });
        off.nextSlot = (slot + 1) % 9;

        if (walkOff) {
          lineScore[offKey].push(inningRuns);
          break game;
        }
      }
      lineScore[offKey].push(inningRuns);
    }
  }

  const winner = score.away > score.home ? 'away' : score.home > score.away ? 'home' : 'draw';
  return { seed, away, home, events, lineScore, score, winner, walkOff };
}
