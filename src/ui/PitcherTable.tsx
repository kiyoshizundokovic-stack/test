/** 投手を選ぶための一覧表（SPEC 4.2.1）：保有選手全員の投手能力を見比べ、並べ替えて選ぶ */
import { useMemo, useState } from 'react';
import {
  calcOverall,
  canPlaceInStage,
  fullName,
  PITCH_LABELS,
  pitchTotal,
  POSITION_SHORT,
  POSITIONS,
  quickRankOf,
  rankOf,
  stageLabel,
  type GamePlan,
  type Player,
} from '../core';

const SHORT_POS = POSITION_SHORT;

type ColumnKey = 'name' | 'placement' | 'velocity' | 'quick' | 'control' | 'stamina' | 'pitches' | 'speed' | 'wisdom' | 'overall';

interface Column {
  key: ColumnKey;
  label: string;
  /** 並べ替えの値 */
  value: (p: Player) => number | string;
  /** 最初に押したときの向き（名前は昇順、能力は降順） */
  ascendingFirst?: boolean;
}

/**
 * 全段階での配置。続く段階で同じ位置ならまとめる（例：「全段階:捕」「先発:投 2番手〜4番手:遊」）。
 * どの段階にも出ていなければ「控え」
 */
export function placementText(plan: GamePlan, id: string): string {
  const posAt = plan.stages.map((st) => POSITIONS.find((p) => st.positions[p] === id));
  if (posAt.every((p) => p === undefined)) return '控え';
  if (posAt.length > 1 && posAt.every((p) => p !== undefined && p === posAt[0])) return `全段階:${SHORT_POS[posAt[0]!]}`;
  const parts: string[] = [];
  let i = 0;
  while (i < posAt.length) {
    const pos = posAt[i];
    let j = i;
    while (j + 1 < posAt.length && posAt[j + 1] === pos) j++;
    if (pos) parts.push(`${stageLabel(i)}${j > i ? `〜${stageLabel(j)}` : ''}:${SHORT_POS[pos]}`);
    i = j + 1;
  }
  return parts.join(' ');
}

interface Props {
  plan: GamePlan;
  roster: readonly Player[];
  stageIndex: number;
  onPick: (playerId: string) => void;
  onClose: () => void;
}

export function PitcherTable({ plan, roster, stageIndex, onPick, onClose }: Props) {
  const current = plan.stages[stageIndex]!.positions.P;
  // 並べ替えの「配置」：この段階の投手 → この段階に出場中 → 控え → 再出場できない
  const placementRank = (p: Player) => {
    if (p.id === current) return 0;
    if (POSITIONS.some((pos) => plan.stages[stageIndex]!.positions[pos] === p.id)) return 1;
    return canPlaceInStage(plan, stageIndex, p.id) ? 2 : 3;
  };
  const columns: Column[] = [
    { key: 'name', label: '名前', value: (p) => `${p.name.family}${p.name.given}`, ascendingFirst: true },
    { key: 'placement', label: '現在の配置', value: placementRank, ascendingFirst: true },
    { key: 'velocity', label: '球速', value: (p) => p.pitcher.velocityKmh },
    { key: 'quick', label: 'クイック', value: (p) => p.pitcher.quick },
    { key: 'control', label: '制球', value: (p) => p.pitcher.control },
    { key: 'stamina', label: '球数', value: (p) => p.pitcher.stamina },
    { key: 'pitches', label: '球種', value: (p) => pitchTotal(p.pitcher.pitches) },
    { key: 'wisdom', label: '賢さ', value: (p) => p.wisdom },
    { key: 'speed', label: '走力', value: (p) => p.fielder.speed },
    { key: 'overall', label: '総合', value: (p) => calcOverall(p) },
  ];
  const [sort, setSort] = useState<{ key: ColumnKey; ascending: boolean }>({ key: 'stamina', ascending: false });
  const rows = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)!;
    return [...roster].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb), 'ja') : va - (vb as number);
      return (sort.ascending ? cmp : -cmp) || calcOverall(b) - calcOverall(a);
    });
    // columns は描画ごとに作り直すが、並べ替えの結果は plan・roster・sort で決まる
  }, [roster, plan, stageIndex, sort]);

  const header = (c: Column) => {
    const active = sort.key === c.key;
    return (
      <th
        key={c.key}
        scope="col"
        className={c.key === 'name' ? 'sticky-col' : c.key === 'placement' || c.key === 'pitches' ? 'left' : undefined}
        aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
      >
        <button
          className="th-sort"
          onClick={() => setSort(active ? { key: c.key, ascending: !sort.ascending } : { key: c.key, ascending: c.ascendingFirst ?? false })}
        >
          {c.label}
          {active ? (sort.ascending ? ' ▲' : ' ▼') : ''}
        </button>
      </th>
    );
  };

  return (
    <div className="pitcher-table-panel" role="region" aria-label="投手の一覧">
      <div className="pitcher-table-head">
        <span className="small muted">
          {stageLabel(stageIndex)}の投手を選ぶ（行をタップ）。見出しで並べ替え。灰色は再出場できない選手
        </span>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div className="table-scroll pitcher-table-scroll">
        <table className="pitcher-table">
          <thead>
            <tr>{columns.map(header)}</tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const selectable = canPlaceInStage(plan, stageIndex, p.id);
              const isCurrent = p.id === current;
              return (
                <tr
                  key={p.id}
                  className={`${isCurrent ? 'current' : ''}${selectable ? '' : ' disabled'}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-disabled={!selectable || undefined}
                  onClick={() => selectable && !isCurrent && onPick(p.id)}
                >
                  <th scope="row" className="sticky-col">
                    <button
                      className="row-pick"
                      disabled={!selectable || isCurrent}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(p.id);
                      }}
                    >
                      {fullName(p.name)}
                    </button>
                    {!selectable && <span className="note">再出場不可</span>}
                  </th>
                  <td className="placement">{isCurrent ? `${placementText(plan, p.id)}（選択中）` : placementText(plan, p.id)}</td>
                  <td>{p.pitcher.velocityKmh}km</td>
                  <td>
                    {quickRankOf(p.pitcher.quick)} {p.pitcher.quick}
                  </td>
                  <td>
                    {rankOf(p.pitcher.control)} {p.pitcher.control}
                  </td>
                  <td>{p.pitcher.stamina}</td>
                  <td className="pitch-list">
                    {p.pitcher.pitches.map((x) => `${PITCH_LABELS[x.type]}${x.rating}`).join(' ')}
                    <span className="muted">（計{pitchTotal(p.pitcher.pitches)}）</span>
                  </td>
                  <td>
                    {rankOf(p.wisdom)} {p.wisdom}
                  </td>
                  <td>
                    {rankOf(p.fielder.speed)} {p.fielder.speed}
                  </td>
                  <td>{calcOverall(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
