import { useMemo, useState } from 'react';
import { validatePlanDetailed, type GamePlan, type Player } from '../core';
import { BattingOrderTab } from './BattingOrderTab';
import { StagesTab } from './StagesTab';

interface Props {
  roster: readonly Player[];
  plan: GamePlan;
  onChange: (plan: GamePlan) => void;
  /** ストックから連れて行った選手（目印を付ける） */
  stockIds?: ReadonlySet<string>;
}

/** 作戦設定（SPEC 4）：打順／継投段階ごとの守備配置 */
export function StrategyEditor({ roster, plan, onChange, stockIds = new Set() }: Props) {
  const [tab, setTab] = useState<'order' | 'stages'>('order');
  const [stageIndex, setStageIndex] = useState(0);
  const players = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const issues = useMemo(() => validatePlanDetailed(plan, roster), [plan, roster]);
  const safeStage = Math.min(stageIndex, plan.stages.length - 1);

  return (
    <div>
      {issues.length === 0 ? (
        <div className="status status-ok" role="status">作戦は有効です（継投 {plan.stages.length} 段階）</div>
      ) : (
        <div className="status status-error" role="alert">
          作戦に問題があります（{issues.length}件）
          <ul>
            {issues.map((i) => (
              <li key={i.message}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'order'} onClick={() => setTab('order')}>
          打順
        </button>
        <button className="tab" role="tab" aria-selected={tab === 'stages'} onClick={() => setTab('stages')}>
          継投・守備
        </button>
      </div>
      {tab === 'order' ? (
        <BattingOrderTab plan={plan} players={players} onChange={onChange} stockIds={stockIds} />
      ) : (
        <StagesTab
          plan={plan}
          roster={roster}
          players={players}
          issues={issues}
          stageIndex={safeStage}
          onSelectStage={setStageIndex}
          onChange={onChange}
        />
      )}
    </div>
  );
}
