import { INITIAL_STAMINA_GUARANTEE, OPPONENT } from './config';
import { generatePlayer } from './generate';
import { fullName } from './names';
import type { Rng } from './rng';
import type { Player } from './types';

/**
 * 相手チームのロースターを生成する（SPEC 5.4）。
 * 先発投手のスタミナ最低値を保証するため、1人目を投手型・スタミナ下限付きで生成する。
 */
export function generateOpponentRoster(
  rng: Rng,
  targetOverall: number,
  size: number = OPPONENT.rosterSize,
  idFactory?: () => string,
): Player[] {
  const taken = new Set<string>();
  const players: Player[] = [];
  for (let i = 0; i < size; i++) {
    const p = generatePlayer(rng, {
      targetOverall,
      takenNames: taken,
      ...(idFactory ? { idFactory } : {}),
      ...(i === 0 ? { archetype: 'pitcher', minStamina: OPPONENT.starterMinStamina } : {}),
    });
    taken.add(fullName(p.name));
    players.push(p);
  }
  return players;
}

/**
 * ニューゲームで自動生成する自チームの選手（SPEC 2.4）。
 * 最初の INITIAL_STAMINA_GUARANTEE.count 人は球数（スタミナ）を下限以上にする（タイプは乱数のまま）。
 * avoidNames：ストックから連れて行く選手など、重複させたくない名前
 */
export function generateInitialRoster(
  rng: Rng,
  count: number,
  targetOverall: number,
  options: { idFactory?: () => string; avoidNames?: ReadonlySet<string> } = {},
): Player[] {
  const taken = new Set<string>(options.avoidNames ?? []);
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const p = generatePlayer(rng, {
      targetOverall,
      takenNames: taken,
      ...(options.idFactory ? { idFactory: options.idFactory } : {}),
      ...(i < INITIAL_STAMINA_GUARANTEE.count ? { minStamina: INITIAL_STAMINA_GUARANTEE.minStamina } : {}),
    });
    taken.add(fullName(p.name));
    players.push(p);
  }
  return players;
}
