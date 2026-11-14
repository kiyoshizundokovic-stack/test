/** ストック（SPEC 7）の画面：ストック一覧・ニューゲームの選手選び・ゲーム終了時の選択 */
import { useMemo, useState } from 'react';
import {
  calcOverall,
  deleteBlocker,
  deleteEntries,
  formatStat,
  isStockPlayer,
  newGameBlocker,
  renamePlayer,
  setFavorite,
  SORT_OPTIONS,
  sortEntries,
  STAT_DEFINITIONS,
  statDefinition,
  STOCK,
  StockError,
  type CareerStats,
  type Player,
  type RunState,
  type StockData,
  type StockEntry,
} from '../core';
import { PlayerRow } from './PlayerCard';

// ---------------------------------------------------------------------------
// 共通：並べ替え・通算成績の表示
// ---------------------------------------------------------------------------

function SortControl({
  sortKey,
  ascending,
  onChange,
}: {
  sortKey: string;
  ascending: boolean;
  onChange: (key: string, ascending: boolean) => void;
}) {
  const groups = ['基本', '能力', '通算成績'] as const;
  return (
    <div className="sort-control">
      <label>
        並べ替え{' '}
        <select
          value={sortKey}
          onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.key === e.target.value)!;
            onChange(opt.key, opt.defaultAscending ?? false);
          }}
        >
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {SORT_OPTIONS.filter((o) => o.group === g).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button className="btn btn-icon" onClick={() => onChange(sortKey, !ascending)} aria-label={ascending ? '昇順（小さい順）' : '降順（大きい順）'}>
        {ascending ? '↑ 昇順' : '↓ 降順'}
      </button>
    </div>
  );
}

/** 一覧の行に出す短い通算成績（並べ替えの項目が通算成績ならそれも） */
function careerSummary(c: CareerStats, sortKey: string): string {
  if (c.plays === 0) return '通算成績なし';
  const s = (k: string) => formatStat(statDefinition(k)!, c);
  const parts = [`${c.plays}プレイ`];
  if (c.batting.pa > 0) parts.push(`打率${s('avg')} ${c.batting.hr}本 OPS${s('ops')}`);
  if (c.pitching.outs > 0) parts.push(`${s('innings')}回 失点率${s('runRate')}`);
  if (sortKey.startsWith('stat:')) {
    const def = statDefinition(sortKey.slice(5));
    if (def && !['avg', 'ops', 'runRate', 'innings', 'plays'].includes(def.key)) parts.push(`${def.label} ${formatStat(def, c)}`);
  }
  return parts.join('／');
}

export function CareerTable({ career }: { career: CareerStats }) {
  const group = (g: 'batting' | 'pitching' | 'other', title: string) => (
    <div>
      <h4 className="career-title">{title}</h4>
      <dl className="ability-grid">
        {STAT_DEFINITIONS.filter((d) => d.group === g).map((d) => (
          <div key={d.key}>
            <dt>{d.label}</dt>
            <dd>{formatStat(d, career)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  return (
    <div className="player-detail">
      {group('other', '通算')}
      {group('batting', '打撃')}
      {group('pitching', '投球')}
      <p className="small muted">
        打数 {career.batting.ab}／二塁打 {career.batting.doubles}／三塁打 {career.batting.triples}／四球 {career.batting.bb}／三振 {career.batting.k}／盗塁企図{' '}
        {career.batting.sbAttempts}／球数 {career.pitching.pitches}／被安打 {career.pitching.hits}／被本塁打 {career.pitching.hrAllowed}／与四球 {career.pitching.bb}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ストック一覧
// ---------------------------------------------------------------------------

function RenameForm({ entry, onRename }: { entry: StockEntry; onRename: (family: string, given: string) => string | null }) {
  const [family, setFamily] = useState(entry.player.name.family);
  const [given, setGiven] = useState(entry.player.name.given);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rename-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onRename(family, given));
      }}
    >
      <input aria-label="姓" value={family} maxLength={STOCK.nameMaxLength + 4} onChange={(e) => setFamily(e.target.value)} />
      <input aria-label="名" value={given} maxLength={STOCK.nameMaxLength + 4} onChange={(e) => setGiven(e.target.value)} />
      <button className="btn" type="submit">
        名前を変更
      </button>
      {error && <span className="small error-text">{error}</span>}
    </form>
  );
}

export function StockScreen({
  stock,
  run,
  onChange,
  onBack,
}: {
  stock: StockData;
  /** 進行中のプレイ（連れて行っている選手は削除できない） */
  run: RunState | null;
  onChange: (stock: StockData) => void;
  onBack: () => void;
}) {
  const [sortKey, setSortKey] = useState('overall');
  const [ascending, setAscending] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const inUse = useMemo(() => (run && run.status !== 'gameover' && run.status !== 'finished' ? new Set(run.stockPlayerIds) : new Set<string>()), [run]);
  const sorted = useMemo(() => sortEntries(stock.entries, sortKey, ascending), [stock, sortKey, ascending]);
  const over = stock.entries.length - STOCK.max;

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>
          ストック（{stock.entries.length}／{STOCK.max}人）
        </h1>
        <button className="btn" onClick={onBack}>
          戻る
        </button>
      </header>
      {over > 0 && (
        <div className="status status-error" role="alert">
          上限（{STOCK.max}人）を{over}人超えています。{over}人以上削除するまでニューゲームを始められません。
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {stock.entries.length === 0 ? (
        <section className="card">
          <p className="hint">ストックはまだ空です。ゲーム終了時に残したい選手を選ぶと、ここに加わります。</p>
        </section>
      ) : (
        <>
          <div className="stock-toolbar">
            <SortControl
              sortKey={sortKey}
              ascending={ascending}
              onChange={(k, asc) => {
                setSortKey(k);
                setAscending(asc);
              }}
            />
            <button
              className="btn"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting((v) => !v);
                setChecked(new Set());
              }}
            >
              {selecting ? '選択をやめる' : 'まとめて削除'}
            </button>
          </div>
          <section className="card">
            <ul className="player-list">
              {sorted.map((e) => {
                const id = e.player.id;
                const blocker = deleteBlocker(stock, id, inUse);
                return (
                  <PlayerRow
                    key={id}
                    p={e.player}
                    {...(inUse.has(id) ? { badge: 'プレイ中' } : {})}
                    note={careerSummary(e.career, sortKey)}
                    leading={
                      <span className="row-leading">
                        {selecting && (
                          <input
                            type="checkbox"
                            aria-label={`${e.player.name.family} ${e.player.name.given}を選択`}
                            checked={checked.has(id)}
                            disabled={blocker !== null}
                            onChange={() => toggle(id)}
                          />
                        )}
                        <button
                          className={`fav${e.favorite ? ' on' : ''}`}
                          aria-pressed={e.favorite}
                          aria-label={e.favorite ? 'お気に入りを外す' : 'お気に入りにする'}
                          onClick={() => onChange(setFavorite(stock, id, !e.favorite))}
                        >
                          {e.favorite ? '★' : '☆'}
                        </button>
                      </span>
                    }
                    extra={
                      <>
                        <CareerTable career={e.career} />
                        <RenameForm
                          entry={e}
                          onRename={(f, g) => {
                            try {
                              onChange(renamePlayer(stock, id, f, g));
                              return null;
                            } catch (err) {
                              return err instanceof StockError ? err.message : String(err);
                            }
                          }}
                        />
                        <div className="detail-actions">
                          <span className="small muted">ストックに入った日時：{e.addedAt ? new Date(e.addedAt).toLocaleString('ja-JP') : '-'}</span>
                          <button
                            className="btn btn-danger"
                            disabled={blocker !== null}
                            title={blocker ?? undefined}
                            onClick={() => {
                              if (!window.confirm(`${e.player.name.family} ${e.player.name.given}をストックから削除しますか？（元に戻せません）`)) return;
                              onChange(deleteEntries(stock, [id], inUse).stock);
                              setMessage('1人削除しました');
                            }}
                          >
                            削除
                          </button>
                        </div>
                        {blocker && <p className="small muted">{blocker}</p>}
                      </>
                    }
                  />
                );
              })}
            </ul>
          </section>
          {selecting && (
            <div className="start-bar">
              <button
                className="btn btn-danger full-btn"
                disabled={checked.size === 0}
                onClick={() => {
                  if (!window.confirm(`選択した${checked.size}人をストックから削除しますか？（元に戻せません）`)) return;
                  const r = deleteEntries(stock, [...checked], inUse);
                  onChange(r.stock);
                  setChecked(new Set());
                  setSelecting(false);
                  setMessage(`${r.deleted}人削除しました${r.skipped > 0 ? `（お気に入り・プレイ中の${r.skipped}人は削除しませんでした）` : ''}`);
                }}
              >
                選択した{checked.size}人を削除
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// ニューゲーム：ストックから最大3人を選ぶ
// ---------------------------------------------------------------------------

export function NewGameScreen({
  stock,
  onStart,
  onBack,
  onOpenStock,
}: {
  stock: StockData;
  onStart: (picks: Player[]) => void;
  onBack: () => void;
  onOpenStock: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState('overall');
  const [ascending, setAscending] = useState(false);
  const sorted = useMemo(() => sortEntries(stock.entries, sortKey, ascending), [stock, sortKey, ascending]);
  const blocker = newGameBlocker(stock);
  const full = picked.length >= STOCK.pickMax;
  const players = picked.map((id) => stock.entries.find((e) => e.player.id === id)!.player);

  return (
    <main className="app">
      <header className="app-header">
        <h1>ニューゲーム</h1>
        <button className="btn" onClick={onBack}>
          戻る
        </button>
      </header>
      {blocker ? (
        <section className="card">
          <div className="status status-error" role="alert">
            {blocker}
          </div>
          <button className="btn btn-primary full-btn" onClick={onOpenStock}>
            ストック一覧へ
          </button>
        </section>
      ) : (
        <>
          <section className="card">
            <p className="hint">
              自動生成の9人に加えて、ストックから最大{STOCK.pickMax}人を連れて行けます。連れて行った選手は売却できず、ボス報酬の強化対象にも選べません。ゲーム終了時に自動でストックに戻り、このプレイの成績が通算成績に加算されます。
            </p>
            <p className="points-line">
              選択中：{players.length === 0 ? 'なし' : players.map((p) => `${p.name.family} ${p.name.given}`).join('、')}（{picked.length}/{STOCK.pickMax}）
            </p>
          </section>
          <div className="stock-toolbar">
            <SortControl
              sortKey={sortKey}
              ascending={ascending}
              onChange={(k, asc) => {
                setSortKey(k);
                setAscending(asc);
              }}
            />
          </div>
          <section className="card">
            <ul className="player-list">
              {sorted.map((e) => {
                const on = picked.includes(e.player.id);
                return (
                  <PlayerRow
                    key={e.player.id}
                    p={e.player}
                    note={careerSummary(e.career, sortKey)}
                    leading={e.favorite ? <span className="fav on">★</span> : undefined}
                    extra={<CareerTable career={e.career} />}
                    actions={
                      <button
                        className="btn choice"
                        aria-pressed={on}
                        disabled={!on && full}
                        onClick={() => setPicked(on ? picked.filter((x) => x !== e.player.id) : [...picked, e.player.id])}
                      >
                        {on ? '連れて行く' : '選ぶ'}
                      </button>
                    }
                  />
                );
              })}
            </ul>
          </section>
          <div className="start-bar">
            <button className="btn btn-primary full-btn" onClick={() => onStart(players)}>
              {players.length > 0 ? `${players.length}人を連れて始める` : 'ストックから連れて行かずに始める'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// ゲーム終了時：ストックに残す選手を選ぶ
// ---------------------------------------------------------------------------

export function KeepSelection({
  run,
  stock,
  onConclude,
}: {
  run: RunState;
  stock: StockData;
  onConclude: (keepIds: string[]) => void;
}) {
  const candidates = run.roster.filter((p) => !isStockPlayer(run, p.id));
  const returning = run.roster.filter((p) => isStockPlayer(run, p.id));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const after = stock.entries.length + checked.size + returning.filter((p) => !stock.entries.some((e) => e.player.id === p.id)).length;
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  };
  return (
    <section className="card">
      <h2>ストックに残す選手</h2>
      <p className="hint">
        次のプレイに連れて行けるよう、ストックに残す選手を選んでください（0人〜全員）。ストックから連れて行った選手は自動で戻り、このプレイの成績が通算成績に加算されます。
      </p>
      <div className="stock-toolbar">
        <button className="btn" onClick={() => setChecked(new Set(candidates.map((p) => p.id)))}>
          全員を選ぶ
        </button>
        <button className="btn" onClick={() => setChecked(new Set())}>
          選択を外す
        </button>
      </div>
      <ul className="player-list">
        {[...candidates]
          .sort((a, b) => calcOverall(b) - calcOverall(a))
          .map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              leading={
                <input
                  type="checkbox"
                  className="keep-check"
                  aria-label={`${p.name.family} ${p.name.given}をストックに残す`}
                  checked={checked.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
              }
            />
          ))}
        {returning.map((p) => (
          <PlayerRow key={p.id} p={p} badge="ストック" note="自動でストックに戻ります" />
        ))}
      </ul>
      <p className="points-line">
        保存後のストック：{after}人／上限{STOCK.max}人
      </p>
      {after > STOCK.max && (
        <p className="status status-error">
          上限を{after - STOCK.max}人超えます。保存はできますが、ストック一覧で削除して{STOCK.max}人以下にするまでニューゲームを始められません。
        </p>
      )}
      <button className="btn btn-primary full-btn" onClick={() => onConclude([...checked])}>
        {checked.size}人をストックに残してタイトルへ
      </button>
    </section>
  );
}
