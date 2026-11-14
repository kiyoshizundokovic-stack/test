/** ローグライク進行の画面（ホーム・結果と補強・ボス報酬・終了） */
import { useState } from 'react';
import {
  acquireBlocker,
  acquirePlayer,
  averageOverall,
  bossRewardPreview,
  buyLife,
  buyLifeBlocker,
  calcOverall,
  fullName,
  LIFE_PRICE,
  MAX_ROSTER_SIZE,
  bossRewardBlocker,
  isStockPlayer,
  OPPONENT,
  resultOptions,
  sellBlocker,
  sellPlayer,
  stageOf,
  type RunState,
  type StockData,
} from '../core';
import { PlayerRow } from './PlayerCard';
import { KeepSelection } from './StockScreens';

export function StatusTiles({ run }: { run: RunState }) {
  const { record } = run;
  return (
    <div className="stat-tiles">
      <div className="stat-tile">
        <div className="label">試合</div>
        <div className="value">
          第{run.gameNumber}戦<span className="sub"> / {OPPONENT.totalGames}</span>
        </div>
      </div>
      <div className="stat-tile">
        <div className="label">ライフ</div>
        <div className="value">{run.life}</div>
      </div>
      <div className="stat-tile">
        <div className="label">ポイント</div>
        <div className="value">{run.points}</div>
      </div>
      <div className="stat-tile">
        <div className="label">戦績</div>
        <div className="value">
          {record.wins}勝{record.losses}敗{record.draws}分
        </div>
      </div>
    </div>
  );
}

export function NextOpponent({ run }: { run: RunState }) {
  const { stage, boss, average } = stageOf(run.gameNumber);
  if (run.next?.rematch) {
    return (
      <p className="points-line">
        次の試合：<span className="boss">再戦</span>　{run.next.opponentName}と、同じ選手・打順・守備配置・継投で再戦します（試合数は進みません）。作戦は変更できます。
      </p>
    );
  }
  return (
    <p className="points-line">
      次の相手：{boss ? <span className="boss">ボス戦</span> : '通常戦'}（強さ 段階{stage + 1}・平均総合力 {average}前後）
    </p>
  );
}

export function RosterList({ run, title = '自チームの選手' }: { run: RunState; title?: string }) {
  return (
    <section className="card">
      <h2>
        {title}（{run.roster.length}名・平均総合力 {averageOverall(run.roster).toFixed(0)}）
      </h2>
      <p className="hint">選手をタップすると全能力を表示します。売却は勝利後の補強フェーズでのみできます。</p>
      <ul className="player-list">
        {run.roster.map((p) => (
          <PlayerRow key={p.id} p={p} {...(isStockPlayer(run, p.id) ? { badge: 'ストック' } : {})} />
        ))}
      </ul>
    </section>
  );
}

/** 試合結果と補強フェーズ（SPEC 5.3） */
export function ResultScreen({
  run,
  onChange,
  onNext,
  onRematch,
}: {
  run: RunState;
  onChange: (r: RunState) => void;
  onNext: () => void;
  onRematch: () => void;
}) {
  const cur = run.current!;
  const mine = cur.game.score[cur.side];
  const theirs = cur.game.score[cur.side === 'away' ? 'home' : 'away'];
  const label = cur.outcome === 'win' ? '勝利' : cur.outcome === 'loss' ? '敗北' : '引き分け';
  const reinforce = cur.outcome === 'win';
  const lifeBlocker = buyLifeBlocker(run);
  const lastGame = cur.gameNumber >= OPPONENT.totalGames;
  const options = resultOptions(run);
  const rematchLabel = cur.outcome === 'loss' ? 'リベンジする' : '再戦する';

  return (
    <>
      <section className="card">
        <p className={`outcome ${cur.outcome}`}>
          {cur.boss && <span className="boss">ボス戦 </span>}
          {cur.rematch && <span className="muted">再戦 </span>}
          {label}　{mine} - {theirs}
        </p>
        {cur.outcome === 'win' && <p className="points-line">勝利ポイント +{cur.pointsGained}（相手の平均総合力 {cur.opponentAverage.toFixed(1)} × 1/10）</p>}
        {cur.outcome === 'loss' && <p className="points-line">ライフ −1（残り {run.life}）</p>}
        {cur.outcome === 'draw' && <p className="points-line">引き分け：ライフ・ポイントの変化なし</p>}
        {options.rematch && (
          <p className="hint">
            {cur.boss
              ? 'ボス戦は勝たないと次に進めません。同じ相手（選手・打順・守備配置・継投）と再戦します。'
              : `「${rematchLabel}」を選ぶと、同じ相手（選手・打順・守備配置・継投）と再戦します。試合数は進みません。`}
            再戦の前に作戦を変更できます。
          </p>
        )}
      </section>
      <StatusTiles run={run} />

      {reinforce && (
        <>
          <section className="card">
            <h2>補強フェーズ</h2>
            <p className="hint">
              獲得（相手から1人まで・総合力と同じポイント）、売却（総合力と同じポイント・9名未満は不可）、ライフ購入（{LIFE_PRICE}
              ポイントで+1）を自由に組み合わせられます。
            </p>
            <button className="btn full-btn" disabled={lifeBlocker !== null} onClick={() => onChange(buyLife(run))}>
              ライフを購入（{LIFE_PRICE}ポイント）{lifeBlocker ? ` - ${lifeBlocker}` : ''}
            </button>
          </section>
          <section className="card">
            <h2>
              相手の選手を獲得{cur.acquired ? '（獲得済み）' : ''}
            </h2>
            <ul className="player-list">
              {[...cur.opponent]
                .sort((a, b) => calcOverall(b) - calcOverall(a))
                .map((p) => {
                  const blocker = acquireBlocker(run, p.id);
                  return (
                    <PlayerRow
                      key={p.id}
                      p={p}
                      note={blocker && !cur.acquired ? blocker : undefined}
                      actions={
                        <button className="btn btn-primary" disabled={blocker !== null} onClick={() => onChange(acquirePlayer(run, p.id))}>
                          獲得 {calcOverall(p)}
                        </button>
                      }
                    />
                  );
                })}
            </ul>
          </section>
          <section className="card">
            <h2>
              自チームの選手を売却（{run.roster.length}/{MAX_ROSTER_SIZE}名）
            </h2>
            <ul className="player-list">
              {run.roster.map((p) => {
                const blocker = sellBlocker(run, p.id);
                return (
                  <PlayerRow
                    key={p.id}
                    p={p}
                    {...(isStockPlayer(run, p.id) ? { badge: 'ストック', note: '売却できません' } : {})}
                    actions={
                      <button
                        className="btn btn-danger"
                        disabled={blocker !== null}
                        title={blocker ?? undefined}
                        onClick={() => {
                          if (window.confirm(`${fullName(p.name)}を${calcOverall(p)}ポイントで売却しますか？`)) onChange(sellPlayer(run, p.id));
                        }}
                      >
                        売却 {calcOverall(p)}
                      </button>
                    }
                  />
                );
              })}
            </ul>
            {run.roster.length <= 9 && <p className="hint">保有選手が9名のため、売却はできません。</p>}
          </section>
        </>
      )}

      <div className="start-bar result-actions-bar">
        {options.gameOver && (
          <button className="btn btn-primary full-btn" onClick={onNext}>
            ゲーム終了へ
          </button>
        )}
        {options.rematch && (
          <button className={`btn full-btn${options.next ? '' : ' btn-primary'}`} onClick={onRematch}>
            {rematchLabel}
          </button>
        )}
        {options.next && (
          <button className="btn btn-primary full-btn" onClick={onNext}>
            {reinforce && cur.boss
              ? '補強を終えてボス報酬へ'
              : lastGame && reinforce
                ? 'ゲーム終了へ'
                : reinforce
                  ? '補強を終えて次の試合へ'
                  : '次戦に進む'}
          </button>
        )}
      </div>
    </>
  );
}

/** ボス戦勝利時の特別報酬（SPEC 5.3）：保有選手を1人選んで強化 */
export function BossRewardScreen({ run, onApply }: { run: RunState; onApply: (playerId: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const target = run.roster.find((p) => p.id === selected);
  return (
    <>
      <section className="card">
        <h2>ボス撃破の特別報酬</h2>
        <p className="hint">
          強化する選手を1人選んでください（ストックから連れて行った選手は選べません）。各能力が総合力換算で+10（野手8能力・賢さ・コントロール・クイック・スタミナ +10、球速 +3km/h、球種 合計+3）上がります。上限は超えません。
        </p>
      </section>
      <section className="card">
        <ul className="player-list">
          {run.roster.map((p) => {
            const blocker = bossRewardBlocker(run, p.id);
            return (
              <PlayerRow
                key={p.id}
                p={p}
                {...(isStockPlayer(run, p.id) ? { badge: 'ストック', note: '強化の対象に選べません' } : {})}
                actions={
                  <button className="btn choice" disabled={blocker !== null} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
                    {selected === p.id ? '選択中' : '選ぶ'}
                  </button>
                }
              />
            );
          })}
        </ul>
      </section>
      <div className="start-bar">
        {target && <p className="small muted">{bossRewardPreview(target).join('、') || 'これ以上強化できる能力がありません'}</p>}
        <button className="btn btn-primary full-btn" disabled={!target} onClick={() => target && onApply(target.id)}>
          {target ? `${fullName(target.name)}を強化する` : '選手を選んでください'}
        </button>
      </div>
    </>
  );
}

/** ゲーム終了（ライフ0／100戦終了） */
export function EndScreen({
  run,
  stock,
  onConclude,
}: {
  run: RunState;
  stock: StockData;
  /** ストックに残す選手を確定する（連れて行った選手は自動で戻る） */
  onConclude: (keepIds: string[]) => void;
}) {
  const finished = run.status === 'finished';
  return (
    <>
      <section className="card">
        <p className={`outcome ${finished ? 'win' : 'loss'}`}>{finished ? '100戦完走！' : 'ゲームオーバー'}</p>
        <p className="points-line">
          {finished ? '全100試合を戦い抜きました。' : `ライフが尽きました（第${run.gameNumber}戦まで）。`}
          {run.record.wins}勝{run.record.losses}敗{run.record.draws}分
        </p>
      </section>
      <KeepSelection run={run} stock={stock} onConclude={onConclude} />
      <section className="card">
        <h2>試合の記録</h2>
        <ol className="history">
          {run.history.map((h, i) => (
            <li key={i}>
              第{h.gameNumber}戦{h.boss ? '（ボス）' : ''}
              {h.rematch ? '（再戦）' : ''} {h.outcome === 'win' ? '○' : h.outcome === 'loss' ? '●' : '△'} {h.score.mine}-{h.score.opponent}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
