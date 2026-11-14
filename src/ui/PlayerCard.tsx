import { useState, type ReactNode } from 'react';
import {
  calcOverall,
  FIELDER_ABILITY_KEYS,
  FIELDER_ABILITY_LABELS,
  fullName,
  PITCH_LABELS,
  quickRankOf,
  rankOf,
  type Player,
} from '../core';
import { BattingAbilities, PitchingAbilities } from './abilities';

/** 選手の能力をすべて表示する表 */
export function PlayerDetail({ p }: { p: Player }) {
  const rows: [string, string][] = [
    ...FIELDER_ABILITY_KEYS.map((k): [string, string] => [FIELDER_ABILITY_LABELS[k], `${rankOf(p.fielder[k])} ${p.fielder[k]}`]),
    ['賢さ', `${rankOf(p.wisdom)} ${p.wisdom}`],
    ['球速', `${p.pitcher.velocityKmh}km/h`],
    ['クイック', `${quickRankOf(p.pitcher.quick)} ${p.pitcher.quick}`],
    ['制球', `${rankOf(p.pitcher.control)} ${p.pitcher.control}`],
    ['スタミナ', `${p.pitcher.stamina}球`],
  ];
  return (
    <div className="player-detail">
      <dl className="ability-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="small">
        球種：{p.pitcher.pitches.map((x) => `${PITCH_LABELS[x.type]} ${x.rating}`).join('／')}
      </p>
    </div>
  );
}

/** 選手一覧の1行（タップで詳細を開閉）。actions に獲得・売却などのボタンを渡す */
export function PlayerRow({ p, actions, note }: { p: Player; actions?: ReactNode; note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="player-row">
      <div className="player-row-main">
        <button className="player-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="player-name">
            {fullName(p.name)} <span className="overall">総合 {calcOverall(p)}</span>
          </span>
          <BattingAbilities p={p} />
          <PitchingAbilities p={p} />
        </button>
        {actions && <div className="player-actions">{actions}</div>}
      </div>
      {note && <div className="player-note">{note}</div>}
      {open && <PlayerDetail p={p} />}
    </li>
  );
}
