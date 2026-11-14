/** タイトル（SPEC 8-1）とデータの入出力（SPEC 6） */
import { useRef, useState } from 'react';
import { makePlaySave, makeStockSave, mergeStock, parseSaveJson, SaveFormatError, STOCK, type RunState, type StockData } from '../core';

interface Props {
  savedRun: RunState | null;
  stock: StockData;
  persistent: boolean;
  error: string | null;
  onContinue: () => void;
  onNewGame: () => void;
  onImportPlay: (run: RunState) => void;
  onImportStock: (stock: StockData) => void;
  onOpenStock: () => void;
}

function describeRun(run: RunState): string {
  const { wins, losses, draws } = run.record;
  const state =
    run.status === 'gameover' ? 'ゲームオーバー' : run.status === 'finished' ? '100戦完走' : `第${run.gameNumber}戦${run.next?.rematch ? '（再戦）' : ''}・ライフ${run.life}`;
  return `${state}／${wins}勝${losses}敗${draws}分／ポイント${run.points}`;
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export function TitleScreen({ savedRun, stock, persistent, error, onContinue, onNewGame, onImportPlay, onImportStock, onOpenStock }: Props) {
  const [showData, setShowData] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** 読み込んだストック（追加か置き換えかを選ぶまで保留） */
  const [pendingStock, setPendingStock] = useState<StockData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ended = savedRun && (savedRun.status === 'gameover' || savedRun.status === 'finished');

  const importFile = async (file: File) => {
    setMessage(null);
    try {
      const data = parseSaveJson(await file.text());
      if (data.kind === 'play') {
        if (savedRun && !window.confirm('進行中のプレイを、読み込んだプレイで置き換えますか？')) return;
        onImportPlay(data.run);
        setMessage(`プレイを読み込みました（${describeRun(data.run)}）`);
      } else if (stock.entries.length === 0) {
        onImportStock(data.stock);
        setMessage(`ストックを読み込みました（${data.stock.entries.length}人）`);
      } else {
        setPendingStock(data.stock);
      }
    } catch (e) {
      setMessage(e instanceof SaveFormatError ? `読み込めませんでした：${e.message}` : `読み込めませんでした：${String(e)}`);
    }
  };

  return (
    <main className="app title-screen">
      <h1 className="title">野球ローグライク</h1>
      {!persistent && (
        <div className="status status-error" role="alert">
          この環境ではブラウザにデータを保存できないため、ページを閉じると進行中のプレイとストックが消えます。「データの入出力」でエクスポートしてください。
        </div>
      )}
      {error && (
        <div className="status status-error" role="alert">
          {error}
        </div>
      )}
      <div className="title-menu">
        {savedRun && (
          <button className="btn btn-primary full-btn" onClick={onContinue}>
            続きから
            <span className="small title-sub">{describeRun(savedRun)}</span>
          </button>
        )}
        <button
          className={`btn full-btn${savedRun ? '' : ' btn-primary'}`}
          onClick={() => {
            if (savedRun && !ended && !window.confirm('進行中のプレイを破棄して新しく始めますか？')) return;
            onNewGame();
          }}
        >
          新しく始める
        </button>
        <button className="btn full-btn" onClick={onOpenStock}>
          ストック一覧（{stock.entries.length}人）
        </button>
        {stock.entries.length > STOCK.max && (
          <p className="status status-error">
            ストックが上限（{STOCK.max}人）を超えています。削除して{STOCK.max}人以下にするまでニューゲームを始められません。
          </p>
        )}
        <button className="btn full-btn" onClick={() => setShowData((v) => !v)} aria-expanded={showData}>
          データの入出力
        </button>
      </div>

      {showData && (
        <section className="card">
          <h2>データの入出力</h2>
          <p className="hint">
            機種変更やバックアップ用に、進行中のプレイとストックをそれぞれJSONファイルに書き出せます。読み込むときは種類を自動で判別します。
          </p>
          <div className="title-menu">
            <button className="btn full-btn" disabled={!savedRun} onClick={() => savedRun && download(`baseball-play-${stamp()}.json`, makePlaySave(savedRun, new Date().toISOString()))}>
              進行中のプレイを書き出す
            </button>
            <button className="btn full-btn" onClick={() => download(`baseball-stock-${stamp()}.json`, makeStockSave(stock, new Date().toISOString()))}>
              ストックを書き出す（{stock.entries.length}人）
            </button>
            <button className="btn full-btn" onClick={() => fileRef.current?.click()}>
              ファイルから読み込む
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {pendingStock && (
            <div className="notice" role="dialog" aria-label="ストックの読み込み方法">
              読み込んだストック（{pendingStock.entries.length}人）を、今のストック（{stock.entries.length}人）にどう反映しますか？
              <div className="title-menu" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-primary full-btn"
                  onClick={() => {
                    const r = mergeStock(stock, pendingStock);
                    onImportStock(r.stock);
                    setPendingStock(null);
                    setMessage(`ストックに追加しました（新しく${r.added}人、同じ選手${r.updated}人を上書き）`);
                  }}
                >
                  追加する（同じ選手は上書き）
                </button>
                <button
                  className="btn btn-danger full-btn"
                  onClick={() => {
                    if (!window.confirm('今のストックを消して、読み込んだストックに置き換えますか？（元に戻せません）')) return;
                    onImportStock(pendingStock);
                    setPendingStock(null);
                    setMessage(`ストックを置き換えました（${pendingStock.entries.length}人）`);
                  }}
                >
                  置き換える
                </button>
                <button className="btn full-btn" onClick={() => setPendingStock(null)}>
                  やめる
                </button>
              </div>
            </div>
          )}
          {message && <p className="points-line">{message}</p>}
        </section>
      )}
    </main>
  );
}
