import { useEffect, useRef, useState } from 'react';
import { createRun, emptyStock, type RunState, type StockData } from './core';
import { openStorage, type SaveStorage } from './storage/db';
import { PlayScreen } from './ui/PlayScreen';
import { TitleScreen } from './ui/TitleScreen';

/** 新しいゲームのシード。ゲームロジックの乱数ではないので時刻から作る（以降はプレイ内のPRNGで決まる） */
const newSeed = () => Date.now() % 2147483647;

/** プレイID（UUID）。選手IDの接頭辞になる。ゲームロジックの乱数とは別に、ブラウザの乱数で作る */
function newRunId(): string {
  const c: Crypto = globalThis.crypto;
  // randomUUID は安全なコンテキスト（https・localhost）でのみ使えるので、ない場合は getRandomValues で作る
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** アプリ全体：起動時にセーブデータを読み込み、タイトルと進行中のプレイを切り替える。プレイは変わるたびに自動保存する */
export function App() {
  const [storage, setStorage] = useState<{ storage: SaveStorage; persistent: boolean } | null>(null);
  const [savedRun, setSavedRun] = useState<RunState | null>(null);
  const [stock, setStock] = useState<StockData>(emptyStock());
  const [run, setRunState] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(Promise.resolve());

  useEffect(() => {
    void (async () => {
      const opened = await openStorage();
      try {
        setSavedRun(await opened.storage.loadPlay());
      } catch (e) {
        setError(`保存されていたプレイを読み込めませんでした（${errorText(e)}）。新しく始めると上書きされます。`);
      }
      try {
        setStock(await opened.storage.loadStock());
      } catch (e) {
        setError(`保存されていたストックを読み込めませんでした（${errorText(e)}）。`);
      }
      setStorage(opened);
    })();
  }, []);

  if (!storage) {
    return (
      <main className="app title-screen">
        <p className="hint">読み込み中…</p>
      </main>
    );
  }

  /** 状態を更新して自動保存（保存は順番に行う） */
  const setRun = (next: RunState) => {
    setRunState(next);
    setSavedRun(next);
    saving.current = saving.current
      .then(() => storage.storage.savePlay(next))
      .catch((e) => setError(`自動保存に失敗しました（${errorText(e)}）`));
  };
  const newGame = () => setRun(createRun(newSeed(), newRunId()));
  const toTitle = () => {
    setRunState(null);
    window.scrollTo(0, 0);
  };

  if (run) return <PlayScreen run={run} setRun={setRun} onTitle={toTitle} onNewGame={newGame} />;

  return (
    <TitleScreen
      savedRun={savedRun}
      stock={stock}
      persistent={storage.persistent}
      error={error}
      onContinue={() => savedRun && setRunState(savedRun)}
      onNewGame={newGame}
      onImportPlay={(r) => {
        setSavedRun(r);
        void storage.storage.savePlay(r).catch((e) => setError(`保存に失敗しました（${errorText(e)}）`));
      }}
      onImportStock={(s) => {
        setStock(s);
        void storage.storage.saveStock(s).catch((e) => setError(`保存に失敗しました（${errorText(e)}）`));
      }}
    />
  );
}
