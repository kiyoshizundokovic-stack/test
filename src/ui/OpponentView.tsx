/** 相手チームの情報（試合前の「相手」タブ、敗北・引き分け後の結果画面）：全選手の能力・総合力、打順・守備配置・継投 */
import {
  averageOverall,
  calcOverall,
  fullName,
  POSITION_LABELS,
  POSITIONS,
  positionOf,
  positionSummary,
  stageLabel,
  type GamePlan,
  type Player,
} from '../core';
import { PlayerRow } from './PlayerCard';

/** 継投の各段階で起きる交代（入る選手・守備位置の変更）の説明 */
function stageChanges(plan: GamePlan, index: number, name: (id: string) => string): string[] {
  const prev = plan.stages[index - 1]!;
  const stage = plan.stages[index]!;
  const lines: string[] = [];
  stage.lineup.forEach((id, slot) => {
    const before = positionOf(prev, id);
    const now = positionOf(stage, id)!;
    if (prev.lineup[slot] !== id) lines.push(`${slot + 1}番 ${name(prev.lineup[slot]!)} → ${name(id)}（${POSITION_LABELS[now]}）`);
    else if (before && before !== now) lines.push(`${name(id)} ${POSITION_LABELS[before]} → ${POSITION_LABELS[now]}`);
  });
  return lines;
}

export function OpponentView({ name, players, plan }: { name: string; players: readonly Player[]; plan: GamePlan }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (id: string) => fullName(byId.get(id)!.name);
  const first = plan.stages[0]!;
  const sorted = [...players].sort((a, b) => calcOverall(b) - calcOverall(a));
  return (
    <section className="card opponent-view" aria-label="相手チーム">
      <h2>
        {name}（{players.length}名・平均総合力 {averageOverall([...players]).toFixed(0)}）
      </h2>
      <h3 className="sub-heading">打順・守備位置（先発）</h3>
      <ol className="opponent-lineup">
        {first.lineup.map((id, i) => {
          const pos = positionOf(first, id)!;
          const p = byId.get(id)!;
          return (
            <li key={id}>
              <span className="muted">{i + 1}番</span>
              <span className={`pos-badge${pos === 'P' ? ' pitcher' : ''}`}>{POSITION_LABELS[pos]}</span>
              <span className="name">{fullName(p.name)}</span>
              <span className="muted small">総合 {calcOverall(p)}</span>
            </li>
          );
        })}
      </ol>
      <h3 className="sub-heading">継投</h3>
      <ol className="opponent-stages">
        {plan.stages.map((stage, i) => (
          <li key={i}>
            <b>{stageLabel(i)}</b> {nameOf(stage.positions.P)}
            {i > 0 && (
              <ul className="small muted">
                {stageChanges(plan, i, nameOf).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <p className="small muted">
        控え：
        {players
          .filter((p) => !plan.stages.some((st) => POSITIONS.some((pos) => st.positions[pos] === p.id)))
          .map((p) => fullName(p.name))
          .join('、') || 'なし'}
      </p>
      <h3 className="sub-heading">全選手（タップで全能力）</h3>
      <ul className="player-list">
        {sorted.map((p) => (
          <PlayerRow key={p.id} p={p} pos={positionSummary(plan, p.id)} />
        ))}
      </ul>
    </section>
  );
}
