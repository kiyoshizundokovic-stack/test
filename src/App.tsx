import { useState } from 'react';
import { buildAutoPlan, generateOpponentRoster, PLAYER_GENERATION, Rng, type GamePlan, type Player } from './core';
import { StrategyEditor } from './ui/StrategyEditor';

/** 12人のサンプルチーム（フェーズ4時点の動作確認用。ゲーム進行はフェーズ6で実装） */
function sampleTeam(seed: number): { roster: Player[]; plan: GamePlan } {
  const roster = generateOpponentRoster(new Rng(seed), PLAYER_GENERATION.initialTargetOverall);
  return { roster, plan: buildAutoPlan(roster) };
}

export function App() {
  const [seed, setSeed] = useState(1);
  const [team, setTeam] = useState(() => sampleTeam(1));

  const regenerate = () => {
    const next = seed + 1;
    setSeed(next);
    setTeam(sampleTeam(next));
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>作戦設定</h1>
        <button className="btn" onClick={regenerate}>
          サンプルチームを変更
        </button>
      </header>
      <StrategyEditor roster={team.roster} plan={team.plan} onChange={(plan) => setTeam({ ...team, plan })} />
    </main>
  );
}
