/**
 * 選手の一意ID（SPEC 2.1）。プレイごとの「プレイID」（UUID。画面側で作る）＋通し番号。
 * 通し番号は RunState.nextSerial に保存するので、リロード後も重複しない。
 * 自チーム・相手チームの選手とも、このプレイで生成した選手はすべてこの形式になる。
 * ストックの選手は持ち越し元のIDをそのまま使う（7b）。
 */
export function playerId(runId: string, serial: number): string {
  return `${runId}-${serial.toString(36)}`;
}

/** 通し番号を進めながらIDを作る関数を返す。使い終わったら next() の値を state に書き戻す */
export function idCounter(runId: string, start: number): { factory: () => string; next: () => number } {
  let serial = start;
  return {
    factory: () => playerId(runId, serial++),
    next: () => serial,
  };
}

/** プレイIDとして使える文字列か（英数字とハイフン、8〜64文字） */
export function isValidRunId(runId: string): boolean {
  return /^[A-Za-z0-9-]{8,64}$/.test(runId);
}
