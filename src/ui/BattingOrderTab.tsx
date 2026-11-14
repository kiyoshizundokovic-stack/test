import { useState } from 'react';
import {
  fullName,
  moveBattingSlot,
  positionOf,
  POSITION_LABELS,
  setStealPolicy,
  STEAL_POLICIES,
  STEAL_POLICY_LABELS,
  stealPolicyOf,
  swapBattingSlots,
  type GamePlan,
  type Player,
  type StealPolicy,
} from '../core';
import { BattingAbilities } from './abilities';
import { StockBadge } from './PlayerCard';

interface Props {
  plan: GamePlan;
  players: Map<string, Player>;
  onChange: (plan: GamePlan) => void;
  stockIds: ReadonlySet<string>;
}

/** 打順（先発の段階の打順。打順は人に紐づくので継投段階にもそのまま反映される） */
export function BattingOrderTab({ plan, players, onChange, stockIds }: Props) {
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
      <p className="hint">
        2人を順にタップすると打順を入れ替えます。▲▼で1つずつ移動します。盗塁は選手ごとに「禁止／通常（見込み成功率80%以上で企図）／積極（70%以上）」を選べます。
      </p>
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
                {fullName(p.name)} {stockIds.has(id) && <StockBadge />}
                <br />
                <BattingAbilities p={p} />
                <br />
                <label className="steal-policy" onClick={(e) => e.stopPropagation()}>
                  盗塁
                  <select
                    aria-label={`${fullName(p.name)}の盗塁の積極度`}
                    value={stealPolicyOf(plan, id)}
                    onChange={(e) => onChange(setStealPolicy(plan, id, e.target.value as StealPolicy))}
                  >
                    {STEAL_POLICIES.map((policy) => (
                      <option key={policy} value={policy}>
                        {STEAL_POLICY_LABELS[policy]}
                      </option>
                    ))}
                  </select>
                </label>
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
