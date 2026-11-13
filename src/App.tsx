import { useState } from 'react';
import {
  buildAutoPlan,
  generateOpponentRoster,
  PLAYER_GENERATION,
  Rng,
  simulateGame,
  validatePlan,
  type GamePlan,
  type GameResult,
  type Player,
  type TeamEntry,
} from './core';
import { GameScreen } from './ui/GameScreen';
import { StrategyEditor } from './ui/StrategyEditor';

/**
 * フェーズ5時点の動作確認用の画面遷移：サンプルチームで作戦設定 → 試合（ランダムな相手）→ 結果。
 * ゲーム進行（ポイント・補強・相手の強さ・ライフ）はフェーズ6で実装する。
 */
function sampleTeam(seed: number): { roster: Player[]; plan: GamePlan } {
  const roster = generateOpponentRoster(new Rng(seed), PLAYER_GENERATION.initialTargetOverall);
  return { roster, plan: buildAutoPlan(roster) };
}

export function App() {
  const [seed, setSeed] = useState(1);
  const [team, setTeam] = useState(() => sampleTeam(1));
  const [gameCount, setGameCount] = useState(0);
  const [game, setGame] = useState<GameResult | null>(null);
  const valid = validatePlan(team.plan, team.roster).length === 0;

  const regenerate = () => {
    const next = seed + 1;
    setSeed(next);
    setTeam(sampleTeam(next));
  };

  const startGame = () => {
    // 相手・先攻後攻・試合のシードはサンプルの seed と試合数から決める（Math.random は使わない）
    const rng = new Rng(seed * 10007 + gameCount + 1);
    const opponentPlayers = generateOpponentRoster(rng, PLAYER_GENERATION.initialTargetOverall);
    const mine: TeamEntry = { name: '自チーム', players: team.roster, plan: team.plan };
    const opponent: TeamEntry = { name: '相手', players: opponentPlayers, plan: buildAutoPlan(opponentPlayers) };
    const [away, home] = rng.next() < 0.5 ? [mine, opponent] : [opponent, mine];
    setGame(simulateGame(away, home, rng.int(0, 0x7fffffff)));
    setGameCount((n) => n + 1);
    window.scrollTo(0, 0);
  };

  if (game) {
    return (
      <main className="app">
        <header className="app-header">
          <h1>試合</h1>
          <span className="muted small">
            先攻 {game.away.name}／後攻 {game.home.name}
          </span>
        </header>
        <GameScreen game={game} onBack={() => setGame(null)} />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>作戦設定</h1>
        <button className="btn" onClick={regenerate}>
          サンプルチームを変更
        </button>
      </header>
      <StrategyEditor roster={team.roster} plan={team.plan} onChange={(plan) => setTeam({ ...team, plan })} />
      <div className="start-bar">
        <button className="btn btn-primary" disabled={!valid} onClick={startGame}>
          {valid ? 'この作戦で試合開始' : '作戦に問題があるため試合を開始できません'}
        </button>
      </div>
    </main>
  );
}
