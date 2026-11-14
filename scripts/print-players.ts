/**
 * 選手を生成して能力表をコンソールに出力する。
 *   npm run players                # シード = 現在時刻
 *   npm run players -- 12345       # シード指定
 *   npm run players -- 12345 12    # シード・人数指定
 */
import { formatPlayerTable, generatePlayers, INITIAL_ROSTER_SIZE, Rng } from '../src/core';

const seed = process.argv[2] !== undefined ? Number(process.argv[2]) : Date.now() % 1_000_000;
const count = process.argv[3] !== undefined ? Number(process.argv[3]) : INITIAL_ROSTER_SIZE;

const rng = new Rng(seed);
const players = generatePlayers(rng, count);
console.log(`seed: ${seed} / ${count}人\n`);
console.log(formatPlayerTable(players));
