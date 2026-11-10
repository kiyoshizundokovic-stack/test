import { useState } from 'react';
import { fullName, moveBattingSlot, positionOf, POSITION_LABELS, swapBattingSlots, type GamePlan, type Player } from '../core';
import { BattingAbilities } from './abilities';

interface Props {
  plan: GamePlan;
  players: Map<string, Player>;
  onChange: (plan: GamePlan) => void;
}

/** 打順（先発の段階の打順。打順は人に紐づくので継投段階にもそのまま反映される） */
export function BattingOrderTab({ plan, players, onChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const stage = plan.stages[0]!;

  const tap = (slot: number) => {
    if (selected === null) setSelected(slot);
    else if (selected === slot) setSelected(null);
    else {
      onChange(swapBattingSlots(plan, selected, slot));
      setSelected(null);
    }
  };

  return (
    <section className="card">
      <h2>打順</h2>
      <p className="hint">2人を順にタップすると打順を入れ替えます。▲▼で1つずつ移動します。</p>
      <ol className="order-list">
        {stage.lineup.map((id, slot) => {
          const p = players.get(id)!;
          const pos = positionOf(stage, id)!;
          return (
            <li
              key={id}
              className={`order-row${selected === slot ? ' selected' : ''}`}
              onClick={() => tap(slot)}
              aria-selected={selected === slot}
            >
              <span className="slot">{slot + 1}</span>
              <span className={`pos-badge${pos === 'P' ? ' pitcher' : ''}`}>{POSITION_LABELS[pos]}</span>
              <span className="name">
                {fullName(p.name)}
                <br />
                <BattingAbilities p={p} />
              </span>
              <span className="moves">
                <button
                  className="btn btn-icon"
                  aria-label={`${slot + 1}番を上へ`}
                  disabled={slot === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(null);
                    onChange(moveBattingSlot(plan, slot, slot - 1));
                  }}
                >
                  ▲
                </button>
                <button
                  className="btn btn-icon"
                  aria-label={`${slot + 1}番を下へ`}
                  disabled={slot === 8}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(null);
                    onChange(moveBattingSlot(plan, slot, slot + 1));
                  }}
                >
                  ▼
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
