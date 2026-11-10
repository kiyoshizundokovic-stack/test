/**
 * 2チームで1試合をシミュレートし、ログ・スコアボード・成績を出力する。
 *   npm run game                 # シード = 現在時刻
 *   npm run game -- 12345        # シード指定（同じシードなら同じ結果）
 *   npm run game -- 12345 500    # 両チームの平均総合力を指定
 */
import {
  buildAutoPlan,
  formatBoxScore,
  formatGameLog,
  formatLineScore,
  formatPlayerTable,
  formatStartingLineup,
  generateOpponentRoster,
  PLAYER_GENERATION,
  Rng,
  simulateGame,
  type TeamEntry,
} from '../src/core';

const seed = process.argv[2] !== undefined ? Number(process.argv[2]) : Date.now() % 1_000_000;
const target = process.argv[3] !== undefined ? Number(process.argv[3]) : PLAYER_GENERATION.initialTargetOverall;

const rng = new Rng(seed);
const makeTeam = (name: string): TeamEntry => {
  const players = generateOpponentRoster(rng, target);
  return { name, players, plan: buildAutoPlan(players) };
};
const a = makeTeam('チームA');
const b = makeTeam('チームB');
// 先攻・後攻はランダム
const [away, home] = rng.next() < 0.5 ? [a, b] : [b, a];
const game = simulateGame(away, home, rng.int(0, 0x7fffffff));

console.log(`seed: ${seed}\n`);
for (const t of [away, home]) {
  console.log(`=== ${t.name} 選手 ===`);
  console.log(formatPlayerTable(t.players));
  console.log('');
}
console.log(`=== スタメン（先攻：${away.name} / 後攻：${home.name}） ===`);
console.log(formatStartingLineup(away));
console.log(formatStartingLineup(home));
console.log('\n=== 試合ログ ===');
console.log(formatGameLog(game));
console.log('\n=== スコアボード ===');
console.log(formatLineScore(game));
const result = game.winner === 'draw' ? '引き分け' : `${game[game.winner].name}の勝利${game.walkOff ? '（サヨナラ）' : ''}`;
console.log(`\n${result}\n`);
console.log('=== 成績 ===');
console.log(formatBoxScore(game));
