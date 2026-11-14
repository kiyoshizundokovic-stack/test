import { describe, expect, it } from 'vitest';
import {
  BOSS_REWARD,
  INITIAL_LIFE,
  INITIAL_POINTS,
  LIFE_PRICE,
  MAX_ROSTER_SIZE,
  MIN_ROSTER_SIZE,
  OPPONENT,
  PITCH_RATING_MAX,
  VELOCITY_MAX_KMH,
} from '../config';
import { buildAutoPlan, validatePlan } from '../game/plan';
import { reconcilePlan, playersOnField } from '../game/planEdit';
import { generatePlayers } from '../generate';
import { calcOverall } from '../overall';
import { Rng } from '../rng';
import {
  acquireBlocker,
  acquirePlayer,
  applyBossReward,
  applyBossRewardToPlayer,
  buyLife,
  buyLifeBlocker,
  createRun,
  finishResult,
  playGame,
  RunError,
  sellBlocker,
  sellPlayer,
  canReinforce,
  resultOptions,
  setPlan,
  showResult,
  stageOf,
  startRematch,
  winPoints,
} from './run';
import type { RunState } from './types';

/** 勝つまで新しいランで試合を繰り返し、勝利後の結果画面の状態を返す */
function firstWin(seedStart = 1): RunState {
  for (let seed = seedStart; seed < seedStart + 200; seed++) {
    let s = createRun(seed);
    s = showResult(playGame(s));
    if (s.current!.outcome === 'win') return s;
  }
  throw new Error('勝てなかった');
}

describe('ローグライク進行', () => {
  it('初期状態：選手9名・ポイント500・ライフ3・第1戦・作戦は有効', () => {
    const s = createRun(1);
    expect(s.roster).toHaveLength(9);
    expect(s.points).toBe(INITIAL_POINTS);
    expect(s.life).toBe(INITIAL_LIFE);
    expect(s.gameNumber).toBe(1);
    expect(s.status).toBe('strategy');
    expect(validatePlan(s.plan, s.roster)).toEqual([]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // セーブ可能（JSONで往復できる）
  });

  it('強さの段階：通常戦 500+50n、10戦ごとにボス 650+50n', () => {
    expect(stageOf(1)).toEqual({ stage: 0, boss: false, average: 500 });
    expect(stageOf(9)).toEqual({ stage: 0, boss: false, average: 500 });
    expect(stageOf(10)).toEqual({ stage: 0, boss: true, average: 650 });
    expect(stageOf(11)).toEqual({ stage: 1, boss: false, average: 550 });
    expect(stageOf(99)).toEqual({ stage: 9, boss: false, average: 950 });
    expect(stageOf(100)).toEqual({ stage: 9, boss: true, average: 1100 });
  });

  it('同じシード・同じ操作なら同じ結果になる', () => {
    const a = playGame(createRun(7));
    const b = playGame(createRun(7));
    expect(a).toEqual(b);
  });

  it('試合：相手は12名で先発スタミナ100以上。勝利でポイント、敗北でライフ−1、引き分けは変化なし', () => {
    let seen = { win: false, loss: false, draw: false };
    for (let seed = 1; seed < 80 && !(seen.win && seen.loss && seen.draw); seed++) {
      const before = createRun(seed);
      const s = playGame(before);
      const cur = s.current!;
      expect(cur.opponent).toHaveLength(OPPONENT.rosterSize);
      expect(Math.max(...cur.opponent.map((p) => p.pitcher.stamina))).toBeGreaterThanOrEqual(OPPONENT.starterMinStamina);
      seen = { ...seen, [cur.outcome]: true };
      if (cur.outcome === 'win') {
        expect(cur.pointsGained).toBe(winPoints(cur.opponent));
        expect(cur.pointsGained).toBe(Math.floor((cur.opponent.reduce((a, p) => a + calcOverall(p), 0) / 12) / 10));
        expect(s.points).toBe(before.points + cur.pointsGained);
        expect(s.life).toBe(before.life);
      } else if (cur.outcome === 'loss') {
        expect(s.points).toBe(before.points);
        expect(s.life).toBe(before.life - 1);
      } else {
        expect(s.points).toBe(before.points);
        expect(s.life).toBe(before.life);
      }
      // 敗北・引き分けでは補強できない
      if (cur.outcome !== 'win') {
        const r = showResult(s);
        expect(sellBlocker(r, r.roster[0]!.id)).not.toBeNull();
        expect(acquireBlocker(r, cur.opponent[0]!.id)).not.toBeNull();
        expect(buyLifeBlocker(r)).not.toBeNull();
        const next = finishResult(r);
        expect(next.status).toBe('strategy');
        expect(next.gameNumber).toBe(2);
      }
    }
    expect(seen).toEqual({ win: true, loss: true, draw: true });
  });

  it('補強：獲得は1人まで（追加）、所持枠12名、ポイント不足は不可', () => {
    let s = firstWin();
    s = { ...s, points: 100000 };
    const [a, b] = s.current!.opponent;
    s = acquirePlayer(s, a!.id);
    expect(s.roster).toHaveLength(10);
    expect(s.points).toBe(100000 - calcOverall(a!));
    expect(acquireBlocker(s, b!.id)).toMatch(/1人まで/);
    expect(() => acquirePlayer(s, b!.id)).toThrow(RunError);

    const poor = { ...firstWin(), points: 0 };
    expect(acquireBlocker(poor, poor.current!.opponent[0]!.id)).toMatch(/ポイントが足りません/);

    const full = { ...firstWin(), points: 100000 };
    const extra = generatePlayers(new Rng(9), MAX_ROSTER_SIZE - full.roster.length);
    const fullRoster = { ...full, roster: [...full.roster, ...extra] };
    expect(acquireBlocker(fullRoster, full.current!.opponent[0]!.id)).toMatch(/所持枠/);
    // 売却して枠を空ければ獲得できる
    const sold = sellPlayer(fullRoster, extra[0]!.id);
    expect(acquireBlocker(sold, full.current!.opponent[0]!.id)).toBeNull();
  });

  it('売却：総合力と同じポイント。保有9名未満になる売却は不可', () => {
    const s = firstWin();
    expect(s.roster).toHaveLength(MIN_ROSTER_SIZE);
    expect(sellBlocker(s, s.roster[0]!.id)).toMatch(/9名未満/);
    const withExtra = acquirePlayer({ ...s, points: 100000 }, s.current!.opponent[0]!.id);
    const target = withExtra.roster[0]!;
    const sold = sellPlayer(withExtra, target.id);
    expect(sold.roster).toHaveLength(MIN_ROSTER_SIZE);
    expect(sold.points).toBe(withExtra.points + calcOverall(target));
  });

  it('ライフ購入：1000ポイントで+1、上限なし', () => {
    let s = { ...firstWin(), points: LIFE_PRICE * 3 + 5 };
    for (let i = 0; i < 3; i++) s = buyLife(s);
    expect(s.life).toBe(INITIAL_LIFE + 3);
    expect(s.points).toBe(5);
    expect(buyLifeBlocker(s)).toMatch(/ポイントが足りません/);
  });

  it('ライフ0でゲームオーバー', () => {
    let s = createRun(3);
    s = { ...s, life: 1 };
    for (let i = 0; i < 300; i++) {
      s = showResult(playGame(s));
      s = resultOptions(s).next || resultOptions(s).gameOver ? finishResult(s) : startRematch(s);
      if (s.status === 'bossReward') s = applyBossReward(s, s.roster[0]!.id);
      if (s.status === 'gameover' || s.status === 'finished') break;
    }
    expect(s.status).toBe('gameover');
    expect(s.life).toBe(0);
  });

  it('100戦目（ボス戦）は勝たないと終了しない：勝利なら特別報酬の後に完走、敗北・引き分けは再戦のみ', () => {
    // 100戦目の相手（平均1100）と勝負になるよう、自チームも同程度の強さにする
    const roster = generatePlayers(new Rng(6), 12, { targetOverall: 1100 });
    const base = { ...createRun(5), roster, plan: buildAutoPlan(roster) };
    const seen = { win: false, loss: false, draw: false };
    for (let seed = 0; seed < 200; seed++) {
      let s: RunState = { ...base, gameNumber: 100, life: 5, rngState: seed };
      s = showResult(playGame(s));
      const outcome = s.current!.outcome;
      seen[outcome] = true;
      const opts = resultOptions(s);
      if (outcome === 'win') {
        expect(opts).toEqual({ next: true, rematch: false, gameOver: false });
        s = finishResult(s);
        expect(s.status).toBe('bossReward');
        s = applyBossReward(s, s.roster[0]!.id);
        expect(s.status).toBe('finished');
      } else {
        expect(opts).toEqual({ next: false, rematch: true, gameOver: false });
        expect(() => finishResult(s)).toThrow(RunError);
        s = startRematch(s);
        expect(s.status).toBe('strategy');
        expect(s.gameNumber).toBe(100);
      }
    }
    expect(seen).toEqual({ win: true, loss: true, draw: true });
  });

  it('ボス報酬：各能力+10（球速+3km/h、球種合計+3）。上限は超えない', () => {
    const p = generatePlayers(new Rng(4), 1)[0]!;
    const { player: up } = applyBossRewardToPlayer(p, new Rng(1));
    expect(up.fielder.contact).toBe(Math.min(100, p.fielder.contact + BOSS_REWARD.perAbility));
    expect(up.fielder.steal).toBe(Math.min(100, p.fielder.steal + 10));
    expect(up.wisdom).toBe(Math.min(100, p.wisdom + 10));
    expect(up.pitcher.velocityKmh).toBe(Math.min(VELOCITY_MAX_KMH, p.pitcher.velocityKmh + 3));
    expect(up.pitcher.stamina).toBe(Math.min(150, p.pitcher.stamina + 10));
    expect(up.pitcher.quick).toBe(Math.min(50, p.pitcher.quick + 10));
    const sum = (x: typeof p) => x.pitcher.pitches.reduce((s, y) => s + y.rating, 0);
    expect(sum(up) - sum(p)).toBe(Math.min(3, p.pitcher.pitches.reduce((s, y) => s + PITCH_RATING_MAX - y.rating, 0)));
    expect(up.pitcher.pitches.map((x) => x.type)).toEqual(p.pitcher.pitches.map((x) => x.type)); // 新しい球種は増えない

    // 上限近くの選手
    const maxed = {
      ...p,
      fielder: { ...p.fielder, contact: 95 },
      pitcher: { ...p.pitcher, velocityKmh: 169, pitches: [{ type: 'straight' as const, rating: PITCH_RATING_MAX - 1 }] },
    };
    const r = applyBossRewardToPlayer(maxed, new Rng(2)).player;
    expect(r.fielder.contact).toBe(100);
    expect(r.pitcher.velocityKmh).toBe(VELOCITY_MAX_KMH);
    expect(r.pitcher.pitches).toEqual([{ type: 'straight', rating: PITCH_RATING_MAX }]); // 余りは切り捨て
  });

  it('前回の作戦を引き継ぎ、売却した選手の穴は自動で埋める', () => {
    let s = { ...firstWin(), points: 100000 };
    s = acquirePlayer(s, s.current!.opponent[0]!.id);
    const ss = s.plan.stages[0]!.positions.SS;
    s = sellPlayer(s, ss);
    s = finishResult(s);
    if (s.status === 'bossReward') s = applyBossReward(s, s.roster[0]!.id);
    expect(s.status).toBe('strategy');
    expect(s.planNotes.length).toBeGreaterThan(0);
    expect(playersOnField(s.plan.stages[0]!)).not.toContain(ss);
    expect(validatePlan(s.plan, s.roster)).toEqual([]);
  });
});

describe('リベンジ・再戦（SPEC 5.6）', () => {
  /** 指定した結果になるまで試合を行う（試合番号は gameNumber で指定） */
  function until(outcome: 'win' | 'loss' | 'draw', gameNumber: number, life = 5): RunState {
    for (let seed = 0; seed < 300; seed++) {
      const s = showResult(playGame({ ...createRun(9), gameNumber, life, rngState: seed }));
      if (s.current!.outcome === outcome) return s;
    }
    throw new Error('not found');
  }

  it('通常戦の敗北：ライフ−1のうえで「次戦に進む」「リベンジ」を選べる', () => {
    const s = until('loss', 3);
    expect(s.life).toBe(4);
    expect(resultOptions(s)).toEqual({ next: true, rematch: true, gameOver: false });
    expect(finishResult(s).gameNumber).toBe(4);
    expect(startRematch(s).gameNumber).toBe(3);
  });

  it('通常戦の引き分け：ライフは減らず「次戦に進む」「再戦」を選べる', () => {
    const s = until('draw', 3);
    expect(s.life).toBe(5);
    expect(resultOptions(s)).toEqual({ next: true, rematch: true, gameOver: false });
  });

  it('ボス戦の敗北・引き分け：再戦のみ（次に進めない）', () => {
    for (const o of ['loss', 'draw'] as const) {
      const s = until(o, 10);
      expect(resultOptions(s)).toEqual({ next: false, rematch: true, gameOver: false });
      expect(() => finishResult(s)).toThrow(/ボス戦は勝たないと/);
    }
  });

  it('ライフ0になった敗北は選択肢なしでゲーム終了', () => {
    const s = until('loss', 3, 1);
    expect(s.life).toBe(0);
    expect(resultOptions(s)).toEqual({ next: false, rematch: false, gameOver: true });
    expect(() => startRematch(s)).toThrow(RunError);
    expect(finishResult(s).status).toBe('gameover');
  });

  it('再戦は選手・打順・守備配置・継投がまったく同じ相手で、乱数は新しい。試合数・強さ段階は進まない', () => {
    const lost = until('loss', 10);
    const first = lost.current!;
    let s = startRematch(lost);
    expect(s.rematch!.opponent).toEqual(first.opponent);
    expect(s.rematch!.opponentPlan).toEqual(first.opponentPlan);
    s = showResult(playGame(s));
    const second = s.current!;
    expect(second.rematch).toBe(true);
    expect(second.gameNumber).toBe(10);
    expect(second.boss).toBe(true);
    expect(second.opponent).toEqual(first.opponent);
    expect(second.opponentPlan).toEqual(first.opponentPlan);
    expect(second.opponentName).toBe(first.opponentName);
    expect(second.game.events).not.toEqual(first.game.events);
    expect(s.history.at(-1)!.rematch).toBe(true);
    expect(s.history.at(-2)!.rematch).toBe(false);
    expect(s.record.wins + s.record.losses + s.record.draws).toBe(2); // 戦績には含める
  });

  it('再戦の前に作戦を変更でき、勝てば通常どおり報酬（ボス戦なら特別報酬）が出る', () => {
    // ボス戦の再戦で勝つまで繰り返す
    let s = startRematch(until('loss', 10, 50));
    const swapped = { ...s.plan, stages: s.plan.stages.map((st) => ({ ...st, lineup: [st.lineup[1]!, st.lineup[0]!, ...st.lineup.slice(2)] })) };
    s = setPlan(s, swapped);
    expect(s.plan).toEqual(swapped);
    for (let i = 0; i < 50; i++) {
      const before = s.points;
      s = showResult(playGame(s));
      if (s.current!.outcome === 'win') {
        expect(s.points).toBe(before + winPoints(s.current!.opponent));
        expect(canReinforce(s)).toBe(true);
        s = finishResult(s);
        expect(s.status).toBe('bossReward');
        s = applyBossReward(s, s.roster[0]!.id);
        expect(s.status).toBe('strategy');
        expect(s.gameNumber).toBe(11);
        expect(s.rematch).toBeNull();
        return;
      }
      s = startRematch(s);
    }
    throw new Error('勝てなかった');
  });
});

describe('作戦の補正（reconcilePlan）', () => {
  it('選手が変わっていなければそのまま', () => {
    const s = createRun(2);
    expect(reconcilePlan(s.plan, s.roster)).toEqual({ plan: s.plan, notes: [] });
  });

  it('どの段階の選手を売却しても、補正後の作戦は有効（前の段階の投手を戻さない）', () => {
    const roster = generatePlayers(new Rng(41), 12);
    const plan = buildAutoPlan(roster);
    expect(plan.stages).toHaveLength(4);
    for (const id of new Set(plan.stages.flatMap((st) => playersOnField(st)))) {
      const remaining = roster.filter((p) => p.id !== id);
      const { plan: fixed, notes } = reconcilePlan(plan, remaining);
      expect(notes.length).toBeGreaterThan(0);
      expect(validatePlan(fixed, remaining)).toEqual([]);
      expect(fixed.stages.flatMap((st) => playersOnField(st))).not.toContain(id);
    }
  });
});

describe('100戦の通しプレイ', () => {
  it('簡単な方針で最後まで進められ、状態の制約が守られる', () => {
    let s = createRun(11);
    let guard = 0;
    while (s.status !== 'gameover' && s.status !== 'finished' && guard++ < 400) {
      if (s.status === 'strategy') s = playGame(s);
      else if (s.status === 'game') s = showResult(s);
      else if (s.status === 'result') {
        if (s.current!.outcome === 'win') {
          // 方針：ライフが1ならライフを買い、余裕があれば相手の最強選手を獲得（枠が埋まっていれば最弱を売る）
          if (s.life <= 1 && !buyLifeBlocker(s)) s = buyLife(s);
          const best = [...s.current!.opponent].sort((a, b) => calcOverall(b) - calcOverall(a))[0]!;
          const worst = [...s.roster].sort((a, b) => calcOverall(a) - calcOverall(b))[0]!;
          if (calcOverall(best) > calcOverall(worst)) {
            if (s.roster.length >= MAX_ROSTER_SIZE && !sellBlocker(s, worst.id)) s = sellPlayer(s, worst.id);
            if (!acquireBlocker(s, best.id)) s = acquirePlayer(s, best.id);
          }
        }
        s = resultOptions(s).next || resultOptions(s).gameOver ? finishResult(s) : startRematch(s);
      } else if (s.status === 'bossReward') s = applyBossReward(s, s.roster[0]!.id);
      expect(s.roster.length).toBeGreaterThanOrEqual(MIN_ROSTER_SIZE);
      expect(s.roster.length).toBeLessThanOrEqual(MAX_ROSTER_SIZE);
      expect(s.points).toBeGreaterThanOrEqual(0);
      if (s.status === 'strategy') expect(validatePlan(s.plan, s.roster)).toEqual([]);
    }
    expect(['gameover', 'finished']).toContain(s.status);
    expect(s.record.wins + s.record.losses + s.record.draws).toBe(s.history.length);
    expect(s.history.filter((h) => !h.rematch).length).toBe(s.gameNumber);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
