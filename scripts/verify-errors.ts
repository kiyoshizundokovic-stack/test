/**
 * エラーの検証（仕様変更1）。全員の捕球・送球をそろえたチーム同士で、1チーム1試合あたりのエラー数を集計する。
 *   npm run verify:errors                 # 各500試合
 *   npm run verify:errors -- 1000 3       # 試合数・シード
 * 目安：捕球・送球30前後 1.0〜1.5個 / 50前後 0.5個前後 / 80前後 0.1〜0.2個
 * 後半では、捕球・送球50のチームの1人だけを20にし、遊撃・一塁・左翼に置いたときの差を見る。
 */
import { aggregate, POSITIONS, POSITION_LABELS, runBalanceGames, type GamePlan, type Player, type Position } from '../src/core';

const count = Number(process.argv[2] ?? 500);
const seed = Number(process.argv[3] ?? 1);

const uniform = (value: number) => (players: Player[]) =>
  players.map((p) => ({ ...p, fielder: { ...p.fielder, catching: value, arm: value } }));

const byPosition = (r: ReturnType<typeof aggregate>) =>
  POSITIONS.map((p) => `${POSITION_LABELS[p]} ${r.errorsByPosition[p].toFixed(3)}`).join(' / ');

console.log(`===== 捕球・送球をそろえたチーム（平均総合力500、${count}試合 / seed ${seed}）=====`);
for (const v of [30, 50, 80]) {
  const r = aggregate(runBalanceGames(seed, count, 500, { modifyRoster: uniform(v) }));
  const a = r.errorsByAction;
  console.log(`捕球・送球 ${v}: 失策 ${r.extra.errors.toFixed(2)} 個/チーム・試合（捕球 ${a.field.toFixed(2)} / 送球 ${a.throw.toFixed(2)} / 送球の捕球 ${a.receive.toFixed(2)}）`);
  console.log(`  守備位置ごと: ${byPosition(r)}`);
}

console.log(`\n===== 捕球・送球50のチームで、1人だけ20の選手をどこに置くか =====`);
/** 守備位置 pos の選手の捕球・送球を20にする（全段階で同じ選手） */
const weakAt = (pos: Position) => ({
  modifyRoster: uniform(50),
  modifyPlan: (plan: GamePlan, players: Player[]) => {
    const id = plan.stages[0]!.positions[pos];
    const p = players.find((x) => x.id === id)!;
    p.fielder = { ...p.fielder, catching: 20, arm: 20 };
    return plan;
  },
});
for (const pos of ['SS', '2B', '1B', 'LF'] as const) {
  const r = aggregate(runBalanceGames(seed, count, 500, weakAt(pos)));
  console.log(`弱い選手を${POSITION_LABELS[pos]}に: 失策 ${r.extra.errors.toFixed(2)}  ${POSITION_LABELS[pos]}の失策 ${r.errorsByPosition[pos].toFixed(3)}`);
}
