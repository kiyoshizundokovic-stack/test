import { quickRankOf, rankOf, type Player } from '../core';

/** 能力の短い表示（例：ミB60） */
export function Ability({ label, value, rank }: { label: string; value: number; rank?: string }) {
  return (
    <span>
      {label}
      <b>{rank ?? rankOf(value)}</b>
      {value}{' '}
    </span>
  );
}

export function BattingAbilities({ p }: { p: Player }) {
  return (
    <span className="abilities">
      <Ability label="ミ" value={p.fielder.contact} />
      <Ability label="パ" value={p.fielder.power} />
      <Ability label="眼" value={p.fielder.eye} />
      <Ability label="走" value={p.fielder.speed} />
      <Ability label="盗" value={p.fielder.steal} />
    </span>
  );
}

export function FieldingAbilities({ p }: { p: Player }) {
  return (
    <span className="abilities">
      <Ability label="守" value={p.fielder.fielding} />
      <Ability label="肩" value={p.fielder.arm} />
      <Ability label="捕" value={p.fielder.catching} />
      <Ability label="賢" value={p.wisdom} />
    </span>
  );
}

export function PitchingAbilities({ p }: { p: Player }) {
  const pitchSum = p.pitcher.pitches.reduce((s, x) => s + x.rating, 0);
  return (
    <span className="abilities">
      <b>{p.pitcher.velocityKmh}</b>km <Ability label="制" value={p.pitcher.control} />
      ス<b>{p.pitcher.stamina}</b>球 変<b>{pitchSum}</b>{' '}
      <Ability label="ク" value={p.pitcher.quick} rank={quickRankOf(p.pitcher.quick)} />
      <Ability label="賢" value={p.wisdom} />
    </span>
  );
}
