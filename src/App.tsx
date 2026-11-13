import { useState } from 'react';
import {
  applyBossReward,
  createRun,
  finishResult,
  playGame,
  setPlan,
  showResult,
  validatePlan,
  type RunState,
} from './core';
import { GameScreen } from './ui/GameScreen';
import { BossRewardScreen, EndScreen, NextOpponent, ResultScreen, RosterList, StatusTiles } from './ui/RunScreens';
import { StrategyEditor } from './ui/StrategyEditor';

type HomeTab = 'home' | 'roster' | 'strategy';

/** 新しいゲームのシード。ゲームロジックの乱数ではないので時刻から作る（以降はラン内のPRNGで決まる） */
const newSeed = () => Date.now() % 2147483647;

/**
 * ローグライク進行（SPEC 5）。保存はフェーズ7で実装するため、リロードすると最初からになる。
 */
export function App() {
  const [run, setRun] = useState<RunState>(() => createRun(newSeed()));
  const [tab, setTab] = useState<HomeTab>('home');
  const update = (next: RunState) => {
    setRun(next);
    window.scrollTo(0, 0);
  };

  if (run.status === 'game') {
    const cur = run.current!;
    return (
      <main className="app">
        <header className="app-header">
          <h1>第{cur.gameNumber}戦{cur.boss ? '（ボス戦）' : ''}</h1>
          <span className="muted small">
            先攻 {cur.game.away.name}／後攻 {cur.game.home.name}
          </span>
        </header>
        <GameScreen game={cur.game} onBack={() => update(showResult(run))} backLabel="結果へ" skipLabel="試合を飛ばして結果へ" />
      </main>
    );
  }

  if (run.status === 'result') {
    return (
      <main className="app">
        <header className="app-header">
          <h1>第{run.current!.gameNumber}戦 結果</h1>
        </header>
        <ResultScreen
          run={run}
          onChange={setRun}
          onNext={() => {
            setTab('home');
            update(finishResult(run));
          }}
        />
      </main>
    );
  }

  if (run.status === 'bossReward') {
    return (
      <main className="app">
        <header className="app-header">
          <h1>ボス撃破</h1>
        </header>
        <BossRewardScreen run={run} onApply={(id) => update(applyBossReward(run, id))} />
      </main>
    );
  }

  if (run.status === 'gameover' || run.status === 'finished') {
    return (
      <main className="app">
        <header className="app-header">
          <h1>ゲーム終了</h1>
        </header>
        <EndScreen
          run={run}
          onRestart={() => {
            setTab('home');
            update(createRun(newSeed()));
          }}
        />
      </main>
    );
  }

  // 試合前（ホーム／選手／作戦）
  const planErrors = validatePlan(run.plan, run.roster);
  return (
    <main className="app">
      <header className="app-header">
        <h1>野球ローグライク</h1>
        <button
          className="btn"
          onClick={() => {
            if (window.confirm('現在のゲームを破棄して新しく始めますか？')) {
              setTab('home');
              update(createRun(newSeed()));
            }
          }}
        >
          新規
        </button>
      </header>
      <div className="tabs" role="tablist">
        {(
          [
            ['home', 'ホーム'],
            ['roster', '選手'],
            ['strategy', '作戦'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className="tab" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {run.planNotes.length > 0 && (
        <div className="notice" role="status">
          選手の入れ替えに合わせて作戦を自動で修正しました。「作戦」で確認してください。
          <ul>
            {run.planNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'home' && (
        <>
          <StatusTiles run={run} />
          <section className="card">
            <NextOpponent gameNumber={run.gameNumber} />
            {run.lastBossReward && run.history.length > 0 && run.history[run.history.length - 1]!.boss && (
              <p className="small muted">ボス報酬：{run.lastBossReward.changes.join('、')}</p>
            )}
            {run.history.length > 0 && (
              <p className="small muted">
                前の試合：第{run.history.at(-1)!.gameNumber}戦{' '}
                {run.history.at(-1)!.outcome === 'win' ? '勝利' : run.history.at(-1)!.outcome === 'loss' ? '敗北' : '引き分け'}{' '}
                {run.history.at(-1)!.score.mine}-{run.history.at(-1)!.score.opponent}
              </p>
            )}
          </section>
          <RosterList run={run} />
        </>
      )}
      {tab === 'roster' && <RosterList run={run} />}
      {tab === 'strategy' && <StrategyEditor roster={run.roster} plan={run.plan} onChange={(plan) => setRun(setPlan(run, plan))} />}

      <div className="start-bar">
        <button className="btn btn-primary full-btn" disabled={planErrors.length > 0} onClick={() => update(playGame(run))}>
          {planErrors.length > 0 ? '作戦に問題があります（「作戦」で修正してください）' : `第${run.gameNumber}戦を開始`}
        </button>
      </div>
    </main>
  );
}
