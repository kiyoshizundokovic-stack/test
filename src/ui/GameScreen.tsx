import { useMemo, useState } from 'react';
import {
  computeBoxScore,
  describePlateAppearance,
  describeStageChange,
  describeSteal,
  formatInnings,
  fullName,
  GAME_INNINGS,
  nextStop,
  replayState,
  situationLabel,
  type GameEvent,
  type GameResult,
  type Half,
  type ReplayMode,
} from '../core';

interface Props {
  game: GameResult;
  /** 試合画面を出る（試合終了後のボタン） */
  onBack: () => void;
  backLabel?: string;
  /** 試合途中で出るボタンの文言（省略時は試合途中では出せない） */
  skipLabel?: string;
}

interface LogGroup {
  key: string;
  inning: number;
  half: Half;
  items: { index: number; ev: GameEvent }[];
}

/** 試合画面（SPEC 8-5）：スコアボード＋ログ。速度切替は 1打席ずつ／1イニングずつ／結果まで */
export function GameScreen({ game, onBack, backLabel = '作戦設定に戻る', skipLabel }: Props) {
  const [shown, setShown] = useState(0);
  const names = useMemo(() => {
    const m = new Map([...game.away.players, ...game.home.players].map((p) => [p.id, fullName(p.name)]));
    return (id: string) => m.get(id) ?? id;
  }, [game]);
  const state = useMemo(() => replayState(game, shown), [game, shown]);
  const advance = (mode: ReplayMode) => setShown((n) => nextStop(game, n, mode));

  // ログ：ハーフイニングごとにまとめ、新しい回を上に表示する（回の中は時系列）
  const groups = useMemo(() => {
    const list: LogGroup[] = [];
    game.events.slice(0, shown).forEach((ev, index) => {
      const place = ev.type === 'pa' ? ev.pa : ev.type === 'steal' ? ev.steal : ev.change;
      const key = `${place.inning}-${place.half}`;
      let g = list[list.length - 1];
      if (!g || g.key !== key) {
        g = { key, inning: place.inning, half: place.half, items: [] };
        list.push(g);
      }
      g.items.push({ index, ev });
    });
    return list.reverse();
  }, [game, shown]);

  const result =
    game.winner === 'draw'
      ? '引き分け'
      : `${game[game.winner].name}の勝利${game.walkOff ? '（サヨナラ）' : ''}`;

  return (
    <div className="game-screen">
      <div className="game-sticky">
        <Scoreboard game={game} state={state} />
        {!state.finished && (
          <div className="situation" aria-live="polite">
            <Diamond bases={state.bases} />
            <div className="situation-text">
              <div>
                <b>
                  {state.inning}回{state.half === 'top' ? '表' : '裏'}
                </b>{' '}
                <Outs outs={state.outs} />
              </div>
              <div className="muted small">
                打者 {state.batterId ? names(state.batterId) : '-'}／投手 {state.pitcherId ? names(state.pitcherId) : '-'}
              </div>
            </div>
          </div>
        )}
        <div className="replay-controls" role="group" aria-label="試合の進め方">
          <button className="btn" disabled={state.finished} onClick={() => advance('pa')}>
            次の打席
          </button>
          <button className="btn" disabled={state.finished} onClick={() => advance('inning')}>
            次のイニング
          </button>
          <button className="btn btn-primary" disabled={state.finished} onClick={() => advance('end')}>
            結果まで
          </button>
        </div>
      </div>

      {state.finished && (
        <section className="card result-card">
          <h2>試合終了：{result}</h2>
          <BoxScore game={game} names={names} />
          <div className="result-actions">
            <button className="btn" onClick={() => setShown(0)}>
              最初から見る
            </button>
            <button className="btn btn-primary" onClick={onBack}>
              {backLabel}
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>試合ログ</h2>
        {groups.length === 0 && <p className="hint">「次の打席」で試合を始めます。</p>}
        {groups.map((g) => (
          <div className="log-group" key={g.key}>
            <h3 className="log-head">
              {g.inning}回{g.half === 'top' ? '表' : '裏'}　{game[g.half === 'top' ? 'away' : 'home'].name}の攻撃
            </h3>
            <ol className="log-list">
              {g.items.map(({ index, ev }) => (
                <LogLine key={index} ev={ev} game={game} names={names} latest={index === shown - 1} />
              ))}
            </ol>
          </div>
        ))}
      </section>

      {!state.finished && skipLabel && (
        <button className="btn back-link" onClick={onBack}>
          {skipLabel}
        </button>
      )}
    </div>
  );
}

function LogLine({
  ev,
  game,
  names,
  latest,
}: {
  ev: GameEvent;
  game: GameResult;
  names: (id: string) => string;
  latest: boolean;
}) {
  if (ev.type === 'stage') {
    return (
      <li className={`log-line log-change${latest ? ' latest' : ''}`}>
        {describeStageChange(ev.change, game[ev.change.team].name, names)}
      </li>
    );
  }
  const play = ev.type === 'pa' ? ev.pa : ev.steal;
  const text = ev.type === 'pa' ? describePlateAppearance(ev.pa, names) : describeSteal(ev.steal, names);
  const cls = ['log-line', play.runs > 0 ? 'log-score' : '', play.errors.length > 0 ? 'log-error' : '', latest ? 'latest' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls}>
      <span className="log-situation">{situationLabel(play)}</span>
      <span className="log-text">
        {text}
        {play.runs > 0 && (
          <span className="log-runs">
            {' '}
            [{play.scoreAfter.away}-{play.scoreAfter.home}]
          </span>
        )}
        {ev.type === 'pa' && <span className="muted small"> {ev.pa.pitches}球</span>}
      </span>
    </li>
  );
}

function Scoreboard({ game, state }: { game: GameResult; state: ReturnType<typeof replayState> }) {
  const innings = Array.from({ length: GAME_INNINGS }, (_, i) => i + 1);
  const cell = (side: 'away' | 'home', i: number) => {
    const v = state.lineScore[side][i - 1];
    return v === null ? 'x' : v === undefined ? '' : String(v);
  };
  const current = (side: 'away' | 'home', i: number) =>
    !state.finished && state.inning === i && (state.half === 'top') === (side === 'away');
  return (
    <div className="scoreboard-wrap">
      <table className="scoreboard" aria-label="スコアボード">
        <thead>
          <tr>
            <th scope="col" className="team-col">
              <span className="visually-hidden">チーム</span>
            </th>
            {innings.map((i) => (
              <th key={i} scope="col">
                {i}
              </th>
            ))}
            <th scope="col" className="total">
              R
            </th>
            <th scope="col" className="total">
              H
            </th>
            <th scope="col" className="total">
              E
            </th>
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as const).map((side) => (
            <tr key={side}>
              <th scope="row" className="team-col">
                {game[side].name}
              </th>
              {innings.map((i) => (
                <td key={i} className={current(side, i) ? 'current' : undefined}>
                  {cell(side, i)}
                </td>
              ))}
              <td className="total runs">{state.score[side]}</td>
              <td className="total">{state.hits[side]}</td>
              <td className="total">{state.errors[side]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Diamond({ bases }: { bases: (string | null)[] }) {
  const on = (i: number) => (bases[i] ? 'base on' : 'base');
  return (
    <svg className="diamond" viewBox="0 0 60 44" role="img" aria-label={`走者：${['一', '二', '三'].filter((_, i) => bases[i]).join('・') || 'なし'}`}>
      <rect className={on(1)} x="23" y="2" width="14" height="14" transform="rotate(45 30 9)" />
      <rect className={on(2)} x="5" y="20" width="14" height="14" transform="rotate(45 12 27)" />
      <rect className={on(0)} x="41" y="20" width="14" height="14" transform="rotate(45 48 27)" />
    </svg>
  );
}

function Outs({ outs }: { outs: number }) {
  return (
    <span className="outs" aria-label={`${outs}アウト`}>
      {[0, 1].map((i) => (
        <span key={i} className={i < outs ? 'out on' : 'out'} />
      ))}
      <span className="muted small"> {outs}アウト</span>
    </span>
  );
}

function BoxScore({ game, names }: { game: GameResult; names: (id: string) => string }) {
  const box = useMemo(() => computeBoxScore(game), [game]);
  const [side, setSide] = useState<'away' | 'home'>('away');
  const t = box[side];
  return (
    <div className="boxscore">
      <div className="tabs" role="tablist">
        {(['away', 'home'] as const).map((s) => (
          <button key={s} className="tab" role="tab" aria-selected={side === s} onClick={() => setSide(s)}>
            {game[s].name}
          </button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="stats-table">
          <caption>打撃</caption>
          <thead>
            <tr>
              <th scope="col">打者</th>
              <th scope="col">打数</th>
              <th scope="col">安打</th>
              <th scope="col">本塁</th>
              <th scope="col">打点</th>
              <th scope="col">盗塁</th>
            </tr>
          </thead>
          <tbody>
            {t.batting.map((b) => (
              <tr key={b.playerId}>
                <th scope="row">
                  {b.slot + 1}. {names(b.playerId)}
                </th>
                <td>{b.ab}</td>
                <td>{b.h}</td>
                <td>{b.hr}</td>
                <td>{b.rbi}</td>
                <td>{b.sb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table className="stats-table">
          <caption>投手</caption>
          <thead>
            <tr>
              <th scope="col">投手</th>
              <th scope="col">回</th>
              <th scope="col">球数</th>
              <th scope="col">失点</th>
              <th scope="col">奪三振</th>
            </tr>
          </thead>
          <tbody>
            {t.pitching.map((p) => (
              <tr key={p.playerId}>
                <th scope="row">{names(p.playerId)}</th>
                <td>{formatInnings(p.outs)}</td>
                <td>{p.pitches}</td>
                <td>{p.r}</td>
                <td>{p.k}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        失策：{t.fielding.length === 0 ? 'なし' : t.fielding.map((f) => `${names(f.playerId)} ${f.e}`).join('、')}
      </p>
    </div>
  );
}
