import { OPPONENT } from './config';
import { generatePlayer } from './generate';
import { fullName } from './names';
import type { Rng } from './rng';
import type { Player } from './types';

/**
 * 相手チームのロースターを生成する（SPEC 5.4）。
 * 先発投手のスタミナ最低値を保証するため、1人目を投手型・スタミナ下限付きで生成する。
 */
export function generateOpponentRoster(rng: Rng, targetOverall: number, size: number = OPPONENT.rosterSize): Player[] {
  const taken = new Set<string>();
  const players: Player[] = [];
  for (let i = 0; i < size; i++) {
    const p = generatePlayer(rng, {
      targetOverall,
      takenNames: taken,
      ...(i === 0 ? { archetype: 'pitcher', minStamina: OPPONENT.starterMinStamina } : {}),
    });
    taken.add(fullName(p.name));
    players.push(p);
  }
  return players;
}
