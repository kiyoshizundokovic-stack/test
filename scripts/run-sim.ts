/**
 * ローグライク進行の通しシミュレーション（フェーズ6の確認用）。
 * 簡単な方針で100戦を自動プレイし、到達試合数・完走率・ポイントの推移を集計する。
 *   npm run run-sim                 # 100ラン
 *   npm run run-sim -- 300 1        # ラン数・開始シード
 * 方針：勝利後、ライフが1以下でポイントがあればライフを買う。相手の最強選手が自チームの最弱より強く、
 * 買えるなら獲得（枠が埋まっていれば最弱を売ってから）。ボス報酬は総合力の最も高い選手に。
 */
import {
  acquireBlocker,
  acquirePlayer,
  applyBossReward,
  averageOverall,
  buyLife,
  buyLifeBlocker,
  calcOverall,
  createRun,
  finishResult,
  MAX_ROSTER_SIZE,
  playGame,
  sellBlocker,
  sellPlayer,
  showResult,
  type RunState,
} from '../src/core';

const runs = Number(process.argv[2] ?? 100);
const seed0 = Number(process.argv[3] ?? 1);

function autoPlay(seed: number): RunState {
  let s = createRun(seed);
  while (s.status !== 'gameover' && s.status !== 'finished') {
    if (s.status === 'strategy') s = playGame(s);
    else if (s.status === 'game') s = showResult(s);
    else if (s.status === 'result') {
      if (s.current!.outcome === 'win') {
        if (s.life <= 1 && !buyLifeBlocker(s)) s = buyLife(s);
        const best = [...s.current!.opponent].sort((a, b) => calcOverall(b) - calcOverall(a))[0]!;
        const worst = [...s.roster].sort((a, b) => calcOverall(a) - calcOverall(b))[0]!;
        if (calcOverall(best) > calcOverall(worst)) {
          if (s.roster.length >= MAX_ROSTER_SIZE && !sellBlocker(s, worst.id) && s.points + calcOverall(worst) >= calcOverall(best)) {
            s = sellPlayer(s, worst.id);
          }
          if (!acquireBlocker(s, best.id)) s = acquirePlayer(s, best.id);
        }
      }
      s = finishResult(s);
    } else if (s.status === 'bossReward') {
      const best = [...s.roster].sort((a, b) => calcOverall(b) - calcOverall(a))[0]!;
      s = applyBossReward(s, best.id);
    }
  }
  return s;
}

const results = Array.from({ length: runs }, (_, i) => autoPlay(seed0 + i));
const reached = results.map((r) => r.history.length);
const finished = results.filter((r) => r.status === 'finished').length;
const pct = (n: number) => `${((n / runs) * 100).toFixed(1)}%`;
console.log(`${runs}ラン（開始シード ${seed0}）`);
console.log(`100戦完走: ${finished}（${pct(finished)}）`);
console.log(`到達試合数: 平均 ${(reached.reduce((a, b) => a + b, 0) / runs).toFixed(1)} / 中央値 ${[...reached].sort((a, b) => a - b)[Math.floor(runs / 2)]}`);
for (const n of [10, 20, 30, 50, 70, 90, 100]) {
  console.log(`  ${String(n).padStart(3)}戦以上: ${pct(reached.filter((r) => r >= n).length)}`);
}
const w = results.reduce((a, r) => a + r.record.wins, 0);
const l = results.reduce((a, r) => a + r.record.losses, 0);
const d = results.reduce((a, r) => a + r.record.draws, 0);
console.log(`通算 ${w}勝${l}敗${d}分（勝率 ${(w / (w + l)).toFixed(3)}）`);
console.log(`終了時のチーム平均総合力: ${(results.reduce((a, r) => a + averageOverall(r.roster), 0) / runs).toFixed(0)}`);
console.log(`終了時のポイント平均: ${(results.reduce((a, r) => a + r.points, 0) / runs).toFixed(0)}`);
