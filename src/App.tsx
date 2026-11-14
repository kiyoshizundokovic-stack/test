import { useEffect, useRef, useState } from 'react';
import { concludeRun, createRun, emptyStock, type Player, type RunState, type StockData } from './core';
import { openStorage, type SaveStorage } from './storage/db';
import { PlayScreen } from './ui/PlayScreen';
import { NewGameScreen, StockScreen } from './ui/StockScreens';
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

type Screen = 'title' | 'newGame' | 'stock' | 'play';

/**
 * アプリ全体：起動時にセーブデータ（進行中のプレイ・ストック）を読み込み、画面を切り替える。
 * プレイ・ストックとも、変わるたびに自動保存する。
 */
export function App() {
  const [storage, setStorage] = useState<{ storage: SaveStorage; persistent: boolean } | null>(null);
  const [savedRun, setSavedRun] = useState<RunState | null>(null);
  const [stock, setStockState] = useState<StockData>(emptyStock());
  const [screen, setScreen] = useState<Screen>('title');
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
        setStockState(await opened.storage.loadStock());
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

  /** 保存は順番に行う（直前の保存が終わってから次を書く） */
  const enqueue = (task: () => Promise<void>) => {
    saving.current = saving.current.then(task).catch((e) => setError(`自動保存に失敗しました（${errorText(e)}）`));
  };
  const setRun = (next: RunState) => {
    setSavedRun(next);
    enqueue(() => storage.storage.savePlay(next));
  };
  const setStock = (next: StockData) => {
    setStockState(next);
    enqueue(() => storage.storage.saveStock(next));
  };
  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };
  const startGame = (picks: Player[]) => {
    setRun(createRun(newSeed(), newRunId(), picks));
    go('play');
  };

  if (screen === 'play' && savedRun) {
    return (
      <PlayScreen
        run={savedRun}
        setRun={setRun}
        stock={stock}
        onTitle={() => go('title')}
        onConclude={(keepIds) => {
          // 終了したプレイの選手をストックに反映し、プレイを消す
          setStock(concludeRun(stock, savedRun, keepIds, new Date().toISOString()));
          setSavedRun(null);
          enqueue(() => storage.storage.clearPlay());
          go('title');
        }}
      />
    );
  }

  if (screen === 'stock') return <StockScreen stock={stock} run={savedRun} onChange={setStock} onBack={() => go('title')} />;

  if (screen === 'newGame') {
    return <NewGameScreen stock={stock} onStart={startGame} onBack={() => go('title')} onOpenStock={() => go('stock')} />;
  }

  return (
    <TitleScreen
      savedRun={savedRun}
      stock={stock}
      persistent={storage.persistent}
      error={error}
      onContinue={() => go('play')}
      onNewGame={() => (stock.entries.length > 0 ? go('newGame') : startGame([]))}
      onImportPlay={(r) => setRun(r)}
      onImportStock={(s) => setStock(s)}
      onOpenStock={() => go('stock')}
    />
  );
}
