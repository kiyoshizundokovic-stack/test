import { describe, expect, it } from 'vitest';
import { validatePlan } from '../game/plan';
import { playersOnField } from '../game/planEdit';
import { generatePlayers } from '../generate';
import { calcOverall } from '../overall';
import { Rng } from '../rng';
import { applyBossReward, createRun, finishResult, playGame, resultOptions, showResult, startRematch } from '../run/run';
import type { RunState } from '../run/types';
import { generateOpponentRoster } from '../team';
import { runMatchup } from './matchups';
import { simulateCampaign } from './campaign';
import { DEFAULT_RULES, simulateRun } from './sim';
import { bestAssignment, fieldingValue, FIELD_POSITIONS, optimizedPlan, randomPlan } from './strategy';

describe('分析用の作戦ボット', () => {
  it('optimizedPlan / randomPlan は9〜12人のどのロースターでも有効な作戦を作る', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 40; i++) {
      for (const size of [9, 10, 11, 12]) {
        const players = i % 2 ? generatePlayers(rng, size) : generateOpponentRoster(rng, 500, size);
        const opt = optimizedPlan(players);
        expect(validatePlan(opt, players)).toEqual([]);
        expect(opt.stages).toHaveLength(size - 8); // 控えは全員投手として継投に使う
        const rnd = randomPlan(players, rng);
        expect(validatePlan(rnd, players)).toEqual([]);
      }
    }
  });

  it('守備位置の割り当ては全探索と一致する（最適）', () => {
    const players = generatePlayers(new Rng(3), 8);
    const { total } = bestAssignment(players);
    let best = -Infinity;
    const perm = (rest: number[], acc: number[]) => {
      if (rest.length === 0) {
        best = Math.max(best, acc.reduce((s, pi, j) => s + fieldingValue(players[pi]!, FIELD_POSITIONS[j]!), 0));
        return;
      }
      rest.forEach((x, k) => perm([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, x]));
    };
    perm([0, 1, 2, 3, 4, 5, 6, 7], []);
    expect(total).toBeCloseTo(best, 10);
  });

  it('randomPlan は敵AIと同じ9人を使い、配置・打順だけを変える', () => {
    const players = generateOpponentRoster(new Rng(5), 500);
    const a = randomPlan(players, new Rng(1));
    const b = randomPlan(players, new Rng(2));
    expect(new Set(playersOnField(a.stages[0]!))).toEqual(new Set(playersOnField(b.stages[0]!)));
    expect(a.stages[0]!.lineup).not.toEqual(b.stages[0]!.lineup);
  });

  it('敵AI同士の対戦は勝率およそ5割', () => {
    const r = runMatchup(1, 400, { plan: 'ai', roster: 'opponent', target: 500, size: 12 }, { plan: 'ai', roster: 'opponent', target: 500, size: 12 });
    expect(r.winRate).toBeGreaterThan(0.42);
    expect(r.winRate).toBeLessThan(0.58);
  });
});

describe('ローグライクのシミュレーター', () => {
  it('ストックから選手を連れて行くプレイでも run.ts と同じ結果になる（売却不可・ボス報酬対象外を含む）', () => {
    const picks = generatePlayers(new Rng(99), 3, { targetOverall: 900 });
    for (const seed of [1, 2, 3]) {
      let s: RunState = { ...createRun(seed, 'pick-run-01', picks), life: 10 };
      while (s.status !== 'gameover' && s.status !== 'finished') {
        if (s.status === 'strategy') s = playGame(s);
        else if (s.status === 'game') s = showResult(s);
        else if (s.status === 'result') {
          const o = resultOptions(s);
          s = o.gameOver || o.next ? finishResult(s) : startRematch(s);
        } else if (s.status === 'bossReward') {
          const target = s.roster.filter((p) => !s.stockPlayerIds.includes(p.id)).sort((a, b) => calcOverall(b) - calcOverall(a))[0]!;
          s = applyBossReward(s, target.id);
        }
      }
      const sim = simulateRun(seed, { plan: 'ai', reinforce: 'none' }, { ...DEFAULT_RULES, initialLife: 10 }, picks, 'pick-run-01');
      expect(sim.reached).toBe(s.gameNumber);
      expect([sim.wins, sim.losses, sim.draws]).toEqual([s.record.wins, s.record.losses, s.record.draws]);
      expect(sim.finalRoster).toEqual(s.roster);
    }
  });

  it('既定の規則・補強なしなら run.ts の通しプレイと同じ結果になる（再戦を含む）', () => {
    // ボス戦の再戦も通るよう、ライフを多めにした両者で比べる
    let bossRematches = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const rematch of ['never', 'always'] as const) {
        // run.ts：補強せず、ボス報酬は総合力の最も高い選手。通常戦の敗北・引き分けの後は rematch に従う
        let s: RunState = { ...createRun(seed), life: 10 };
        while (s.status !== 'gameover' && s.status !== 'finished') {
          if (s.status === 'strategy') s = playGame(s);
          else if (s.status === 'game') s = showResult(s);
          else if (s.status === 'result') {
            const o = resultOptions(s);
            if (o.gameOver || (o.next && (s.current!.outcome === 'win' || rematch === 'never'))) s = finishResult(s);
            else {
              if (s.current!.boss) bossRematches++;
              s = startRematch(s);
            }
          } else if (s.status === 'bossReward') s = applyBossReward(s, [...s.roster].sort((a, b) => calcOverall(b) - calcOverall(a))[0]!.id);
        }
        const sim = simulateRun(seed, { plan: 'ai', reinforce: 'none', rematch }, { ...DEFAULT_RULES, initialLife: 10 });
        expect(sim.reached).toBe(s.gameNumber);
        expect([sim.wins, sim.losses, sim.draws]).toEqual([s.record.wins, s.record.losses, s.record.draws]);
        expect(sim.rematches).toBe(s.history.filter((h) => h.rematch).length);
        expect(sim.finished).toBe(s.status === 'finished');
      }
    }
    expect(bossRematches).toBeGreaterThan(0);
  });
});

describe('繰り返しプレイのシミュレーター', () => {
  it('ストックを持ち越し、連れて行く選手は総合力の高い順に最大3人。完走したら終わる', () => {
    const r = simulateCampaign(1, { run: { plan: 'ai', reinforce: 'playerFirst' }, picks: 3 }, DEFAULT_RULES, 6);
    expect(r.plays.length).toBeGreaterThan(0);
    expect(r.plays[0]!.pickAverage).toBe(0); // 初回はストックなし
    for (const p of r.plays.slice(1)) expect(p.pickAverage).toBeGreaterThan(0);
    if (r.firstCompletion !== null) expect(r.plays).toHaveLength(r.firstCompletion);
    // 同じシードなら同じ結果
    expect(simulateCampaign(1, { run: { plan: 'ai', reinforce: 'playerFirst' }, picks: 3 }, DEFAULT_RULES, 6)).toEqual(r);
  });
});
