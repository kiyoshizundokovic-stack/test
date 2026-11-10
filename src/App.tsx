import { useMemo, useState } from 'react';
import { formatPlayerTable, generatePlayers, INITIAL_ROSTER_SIZE, Rng } from './core';

/** フェーズ1時点の仮画面：生成した選手の能力表を表示するだけ */
export function App() {
  const [seed, setSeed] = useState(1);
  const table = useMemo(
    () => formatPlayerTable(generatePlayers(new Rng(seed), INITIAL_ROSTER_SIZE)),
    [seed],
  );
  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>野球ローグライク（開発中）</h1>
      <p>
        seed: {seed} <button onClick={() => setSeed((s) => s + 1)}>再生成</button>
      </p>
      <pre style={{ overflowX: 'auto', fontSize: 12 }}>{table}</pre>
    </main>
  );
}
