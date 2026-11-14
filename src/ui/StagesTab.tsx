import {
  addStage,
  assignPosition,
  canPlaceInStage,
  entrantsOf,
  fullName,
  POSITION_LABELS,
  POSITIONS,
  positionOf,
  removeStage,
  setEntrantSlot,
  stageLabel,
  type GamePlan,
  type PlanIssue,
  type Player,
  type Position,
} from '../core';
import { useState } from 'react';
import { FieldingAbilities, PitchingAbilities } from './abilities';
import { PitcherTable } from './PitcherTable';
import { StockBadge } from './PlayerCard';

interface Props {
  plan: GamePlan;
  roster: readonly Player[];
  players: Map<string, Player>;
  issues: PlanIssue[];
  stageIndex: number;
  stockIds: ReadonlySet<string>;
  onSelectStage: (index: number) => void;
  onChange: (plan: GamePlan) => void;
}

/** 継投と守備位置（段階ごとに9つの守備位置を設定する） */
export function StagesTab({ plan, roster, players, issues, stageIndex, onSelectStage, onChange, stockIds }: Props) {
  const [showPitchers, setShowPitchers] = useState(false);
  const stage = plan.stages[stageIndex]!;
  const prev = plan.stages[stageIndex - 1];
  const isLast = stageIndex === plan.stages.length - 1;
  const name = (id: string) => fullName(players.get(id)!.name) + (stockIds.has(id) ? '・ストック' : '');
  const pitcher = players.get(stage.positions.P)!;
  const stageIssues = issues.filter((i) => i.stage === stageIndex);

  const onField = new Set(POSITIONS.map((p) => stage.positions[p]));
  const { entrants, vacatedSlots } = entrantsOf(plan, stageIndex);

  const changeLines: string[] = [];
  if (prev) {
    const prevField = new Set(POSITIONS.map((p) => prev.positions[p]));
    prev.lineup.forEach((id, slot) => {
      if (!onField.has(id)) {
        const inId = stage.lineup[slot]!;
        changeLines.push(`${slot + 1}番 ${name(id)} → ${name(inId)}（${POSITION_LABELS[positionOf(stage, inId)!]}）`);
      }
    });
    for (const pos of POSITIONS) {
      const id = stage.positions[pos];
      const before = positionOf(prev, id);
      if (prevField.has(id) && before !== pos) {
        changeLines.push(`${name(id)} ${POSITION_LABELS[before!]} → ${POSITION_LABELS[pos]}`);
      }
    }
  }

  const options = (pos: Position) => {
    const current = stage.positions[pos];
    const inStage = roster.filter((p) => onField.has(p.id) && p.id !== current);
    const prevField = new Set(prev ? POSITIONS.map((p) => prev.positions[p]) : []);
    const leaving = roster.filter((p) => !onField.has(p.id) && prevField.has(p.id));
    const bench = roster.filter((p) => !onField.has(p.id) && !prevField.has(p.id) && canPlaceInStage(plan, stageIndex, p.id));
    const removed = roster.filter((p) => !onField.has(p.id) && !canPlaceInStage(plan, stageIndex, p.id));
    return (
      <>
        <option value={current}>{name(current)}</option>
        {inStage.length > 0 && (
          <optgroup label="出場中（守備位置を入れ替え）">
            {inStage.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p.id)}（{POSITION_LABELS[positionOf(stage, p.id)!]}）
              </option>
            ))}
          </optgroup>
        )}
        {leaving.length > 0 && (
          <optgroup label="この段階で退く選手（出場を続けさせる）">
            {leaving.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p.id)}（{POSITION_LABELS[positionOf(prev!, p.id)!]}）
              </option>
            ))}
          </optgroup>
        )}
        {bench.length > 0 && (
          <optgroup label="控え（交代で出場）">
            {bench.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p.id)}
              </option>
            ))}
          </optgroup>
        )}
        {removed.length > 0 && (
          <optgroup label="退いた選手（再出場不可）">
            {removed.map((p) => (
              <option key={p.id} value={p.id} disabled>
                {name(p.id)}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  };

  return (
    <>
      <div className="stage-chips" role="toolbar" aria-label="継投の段階">
        {plan.stages.map((s, i) => (
          <button
            key={i}
            className={`chip${issues.some((x) => x.stage === i) ? ' has-error' : ''}`}
            aria-pressed={i === stageIndex}
            onClick={() => onSelectStage(i)}
          >
            {stageLabel(i)}：{name(s.positions.P)}
          </button>
        ))}
        <button
          className="chip"
          onClick={() => {
            onChange(addStage(plan, roster));
            onSelectStage(plan.stages.length);
          }}
        >
          ＋継投を追加
        </button>
      </div>

      <section className="card">
        <div className="stage-info">
          <p>
            <b>{stageLabel(stageIndex)}</b>　投手 {fullName(pitcher.name)}
            <br />
            <PitchingAbilities p={pitcher} />
          </p>
          {stageIndex > 0 && (
            <button
              className="btn btn-danger"
              onClick={() => {
                onChange(removeStage(plan, stageIndex));
                onSelectStage(stageIndex - 1);
              }}
            >
              この段階を削除
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {isLast
            ? `最後の投手です。${pitcher.pitcher.stamina}球を超えても続投し、超過分だけ能力が下がります。`
            : `${fullName(pitcher.name)}の球数が${pitcher.pitcher.stamina}球に達したら、イニングの途中でも次の段階（${stageLabel(stageIndex + 1)}）に移ります。`}
        </p>
        {stageIssues.length > 0 && (
          <div className="status status-error" role="alert">
            <ul>
              {stageIssues.map((i) => (
                <li key={i.message}>{i.message}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {prev && (
        <section className="card">
          <h2>{stageLabel(stageIndex - 1)}からの変更</h2>
          {changeLines.length === 0 ? (
            <p className="hint">変更なし</p>
          ) : (
            <ul className="changes">
              {changeLines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {entrants.length >= 2 && (
            <>
              <p className="hint" style={{ marginTop: 8 }}>
                入る選手が複数いるので、それぞれが引き継ぐ打順を選べます。
              </p>
              {entrants.map((id) => (
                <div className="entrant-row" key={id}>
                  <span>{name(id)}</span>
                  <select
                    aria-label={`${name(id)}の打順`}
                    value={stage.lineup.indexOf(id)}
                    onChange={(e) => onChange(setEntrantSlot(plan, stageIndex, id, Number(e.target.value)))}
                  >
                    {vacatedSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot + 1}番（{name(prev.lineup[slot]!)}の打順）
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>守備位置</h2>
        <p className="hint">出場中の選手を選ぶと守備位置を入れ替え、控えを選ぶと交代します。</p>
        {POSITIONS.map((pos) => {
          const id = stage.positions[pos];
          const p = players.get(id)!;
          const changed = prev !== undefined && prev.positions[pos] !== id;
          return (
            <div className="pos-row" key={pos}>
              <label className="pos-label" htmlFor={`pos-${pos}`}>
                {POSITION_LABELS[pos]}
              </label>
              <div>
                <select
                  id={`pos-${pos}`}
                  className={changed ? 'changed' : undefined}
                  value={id}
                  onChange={(e) => onChange(assignPosition(plan, stageIndex, pos, e.target.value))}
                >
                  {options(pos)}
                </select>
                {stockIds.has(id) && <StockBadge />} {pos === 'P' ? <PitchingAbilities p={p} /> : <FieldingAbilities p={p} />}
                {pos === 'P' && (
                  <button className="btn pitcher-table-open" aria-expanded={showPitchers} onClick={() => setShowPitchers((v) => !v)}>
                    {showPitchers ? '一覧を閉じる' : '投手を一覧から選ぶ'}
                  </button>
                )}
              </div>
              {pos === 'P' && showPitchers && (
                <div className="pos-row-wide">
                  <PitcherTable
                    plan={plan}
                    roster={roster}
                    stageIndex={stageIndex}
                    stockIds={stockIds}
                    onPick={(pid) => {
                      onChange(assignPosition(plan, stageIndex, 'P', pid));
                      setShowPitchers(false);
                    }}
                    onClose={() => setShowPitchers(false)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>この段階の打順</h2>
        <ol className="compact-order">
          {stage.lineup.map((id, slot) => (
            <li key={id} className={entrants.includes(id) ? 'entered' : undefined}>
              {slot + 1}. {name(id)}（{POSITION_LABELS[positionOf(stage, id)!]}）
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
