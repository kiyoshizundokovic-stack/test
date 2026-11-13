/** 試合ログ・スコアボード・成績のテキスト化（表示用。データは GameResult が正） */
import { fullName } from '../names';
import type { Player } from '../types';
import { padEnd, padStart } from '../format';
import { computeBoxScore, formatInnings } from './stats';
import {
  POSITION_LABELS,
  POSITIONS,
  type GameResult,
  FIELDING_ACTION_LABELS,
  type ErrorRecord,
  type PlateAppearance,
  type StealAttempt,
  type Position,
  type StageChange,
  type TeamEntry,
} from './types';

const SHORT_ZONE: Record<Position, string> = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右',
};

function nameMap(game: GameResult): (id: string) => string {
  const m = new Map<string, Player>();
  for (const p of [...game.away.players, ...game.home.players]) m.set(p.id, p);
  return (id) => {
    const p = m.get(id);
    return p ? fullName(p.name) : id;
  };
}

export function basesLabel(bases: readonly (string | null)[]): string {
  const on = ['一', '二', '三'].filter((_, i) => bases[i]);
  if (on.length === 0) return '走者なし';
  if (on.length === 3) return '満塁';
  return `${on.join('')}塁`;
}

const OUT_LABEL = ['無死', '一死', '二死'];

export function playLabel(pa: PlateAppearance): string {
  const z = pa.zone && pa.zone !== 'HR' ? pa.zone : undefined;
  const zs = z ? SHORT_ZONE[z] : '';
  switch (pa.kind) {
    case 'K': return '三振';
    case 'BB': return '四球';
    case 'HR': return '本塁打';
    case '1B': return z && (pa.zone === 'LF' || pa.zone === 'CF' || pa.zone === 'RF') ? `${zs}前安打` : `${zs}内野安打`;
    case '2B': return `${zs}二塁打`;
    case '3B': return `${zs}三塁打`;
    case 'GO': return `${zs}ゴロ`;
    case 'DP': return `${zs}ゴロ併殺打`;
    case 'FC': return `${zs}ゴロ`; // 一塁走者の封殺は走者の動き（「〇〇アウト」）で表す
    case 'LO': return `${zs}直`;
    case 'FO': return `${zs}飛`;
    case 'SF': return `${zs}犠飛`;
    case 'E': return `${zs}${pa.battedType === 'groundBall' ? 'ゴロ' : pa.battedType === 'lineDrive' ? '直' : '飛'}失策で出塁`;
  }
}

/** エラーの説明（例：「遊撃 山田 太郎の送球エラー」） */
export function errorLabel(err: ErrorRecord, name: (id: string) => string): string {
  return `${POSITION_LABELS[err.position]} ${name(err.playerId)}の${FIELDING_ACTION_LABELS[err.action]}エラー`;
}

const BASE_NAME = ['', '一塁', '二塁', '三塁'];

/** 打席・盗塁の前の状況（例：「3回裏 一死一二塁」） */
export function situationLabel(play: { inning: number; half: 'top' | 'bottom'; outsBefore: number; basesBefore: (string | null)[] }): string {
  return `${play.inning}回${play.half === 'top' ? '表' : '裏'} ${OUT_LABEL[play.outsBefore]}${basesLabel(play.basesBefore)}`;
}

/** 打席の内容（状況・球数を除く。画面表示用） */
export function describePlateAppearance(pa: PlateAppearance, name: (id: string) => string): string {
  const runnerText = pa.moves
    .filter((m) => m.from !== 0 && m.to !== m.from)
    .map((m) => `${name(m.runnerId)}${m.to === 4 ? '生還' : m.to === 0 ? 'アウト' : `${BASE_NAME[m.to]}へ`}`);
  const runs = pa.runs > 0 ? ` ${pa.runs}点` : '';
  const runners = runnerText.length > 0 ? `（${runnerText.join('、')}）` : '';
  const errors = pa.errors.length > 0 ? ` ＜${pa.errors.map((e) => errorLabel(e, name)).join('、')}＞` : '';
  return `${pa.battingSlot + 1}番 ${name(pa.batterId)}：${playLabel(pa)}${runners}${errors}${runs}`;
}

export function formatPlateAppearance(pa: PlateAppearance, name: (id: string) => string): string {
  const head = situationLabel(pa);
  const runnerText = pa.moves
    .filter((m) => m.from !== 0 && m.to !== m.from)
    .map((m) => `${name(m.runnerId)}${m.to === 4 ? '生還' : m.to === 0 ? 'アウト' : `${BASE_NAME[m.to]}へ`}`);
  const runs = pa.runs > 0 ? ` ${pa.runs}点 [${pa.scoreAfter.away}-${pa.scoreAfter.home}]` : '';
  const runners = runnerText.length > 0 ? `（${runnerText.join('、')}）` : '';
  const errors = pa.errors.length > 0 ? ` ＜${pa.errors.map((e) => errorLabel(e, name)).join('、')}＞` : '';
  return `${padEnd(head, 22)} ${pa.battingSlot + 1}番 ${padEnd(name(pa.batterId), 12)} ${playLabel(pa)}${runners}${errors}${runs}  (${pa.pitches}球)`;
}

const STEAL_LABEL: Record<2 | 3 | 4, string> = { 2: '二盗', 3: '三盗', 4: '本盗' };

/** 選手交代の内容（画面表示用） */
export function describeStageChange(c: StageChange, teamName: string, name: (id: string) => string): string {
  return formatStageChange(c, teamName, name).replace(/^\S+ /, '');
}

/** 盗塁の内容（状況を除く。画面表示用） */
export function describeSteal(st: StealAttempt, name: (id: string) => string): string {
  const result = st.success ? '成功' : '失敗（盗塁死）';
  const others = st.moves
    .filter((m) => m.runnerId !== st.runnerId && m.to !== m.from)
    .map((m) => `${name(m.runnerId)}${m.to === 4 ? '生還' : `${BASE_NAME[m.to]}へ`}`);
  const self = st.moves.find((m) => m.runnerId === st.runnerId);
  const extra = self && self.to !== st.to && self.to !== 0 ? `、${self.to === 4 ? '生還' : `${BASE_NAME[self.to]}へ`}` : '';
  const errors = st.errors.length > 0 ? ` ＜${st.errors.map((e) => errorLabel(e, name)).join('、')}＞` : '';
  const runs = st.runs > 0 ? ` ${st.runs}点` : '';
  const pct = Math.round(st.expected * 100);
  return `【盗塁】${name(st.runnerId)} ${STEAL_LABEL[st.to]}${result}${extra}${others.length ? `（${others.join('、')}）` : ''}${errors}${runs}（見込み${pct}%）`;
}

export function formatSteal(st: StealAttempt, name: (id: string) => string): string {
  const score = st.runs > 0 ? ` [${st.scoreAfter.away}-${st.scoreAfter.home}]` : '';
  return `${padEnd(situationLabel(st), 22)} ${describeSteal(st, name)}${score}`;
}

export function formatStageChange(c: StageChange, teamName: string, name: (id: string) => string): string {
  const parts: string[] = [];
  for (const s of c.substitutions) {
    const pos = c.positionChanges.find((pc) => pc.playerId === s.inId)?.to;
    parts.push(`${s.slot + 1}番 ${name(s.outId)} → ${name(s.inId)}${pos ? `（${POSITION_LABELS[pos]}）` : ''}`);
  }
  for (const pc of c.positionChanges) {
    if (pc.from) parts.push(`${name(pc.playerId)} ${POSITION_LABELS[pc.from]}→${POSITION_LABELS[pc.to]}`);
  }
  return `${c.inning}回${c.half === 'top' ? '表' : '裏'} 【${teamName} 選手交代】 ${parts.join(' / ')}`;
}

export function formatGameLog(game: GameResult): string {
  const name = nameMap(game);
  return game.events
    .map((ev) =>
      ev.type === 'pa'
        ? formatPlateAppearance(ev.pa, name)
        : ev.type === 'steal'
          ? formatSteal(ev.steal, name)
          : formatStageChange(ev.change, game[ev.change.team].name, name),
    )
    .join('\n');
}

/** ラインスコア（計の欄に 得点・安打・失策） */
export function formatLineScore(game: GameResult): string {
  const box = computeBoxScore(game);
  const inningCells = Array.from({ length: Math.max(game.lineScore.away.length, game.lineScore.home.length, 9) }, (_, i) => padStart(String(i + 1), 3));
  const row = (team: TeamEntry, runs: (number | null)[], total: number, hits: number, errors: number) =>
    `${padEnd(team.name, 12)}${inningCells.map((_, i) => padStart(runs[i] === null ? 'x' : runs[i] === undefined ? '' : String(runs[i]), 3)).join('')} | ${[total, hits, errors].map((v) => padStart(String(v), 3)).join('')}`;
  return [
    `${padEnd('', 12)}${inningCells.join('')} |   R  H  E`,
    row(game.away, game.lineScore.away, game.score.away, box.away.hits, box.away.errors),
    row(game.home, game.lineScore.home, game.score.home, box.home.hits, box.home.errors),
  ].join('\n');
}

export function formatStartingLineup(team: TeamEntry): string {
  const stage = team.plan.stages[0]!;
  const posOf = new Map<string, Position>(POSITIONS.map((p) => [stage.positions[p], p]));
  const name = new Map(team.players.map((p) => [p.id, fullName(p.name)]));
  const lines = stage.lineup.map((id, i) => `  ${i + 1}番 ${padEnd(POSITION_LABELS[posOf.get(id)!], 4)} ${name.get(id)}`);
  const bench = team.plan.stages.slice(1).map((s, i) => `  継投${i + 1}: ${name.get(s.positions.P)}`);
  return [`${team.name}`, ...lines, ...bench].join('\n');
}

export function formatBoxScore(game: GameResult): string {
  const name = nameMap(game);
  const box = computeBoxScore(game);
  const out: string[] = [];
  for (const key of ['away', 'home'] as const) {
    const t = box[key];
    out.push(`■ ${game[key].name}`);
    out.push(`  ${padEnd('打者', 16)} 打数 安打 本塁 打点 四球 三振 盗塁 盗死`);
    for (const b of t.batting) {
      out.push(`  ${padEnd(`${b.slot + 1} ${name(b.playerId)}`, 16)} ${[b.ab, b.h, b.hr, b.rbi, b.bb, b.k, b.sb, b.cs].map((v) => padStart(String(v), 4)).join(' ')}`);
    }
    out.push(`  ${padEnd('投手', 16)} 投球回 球数 被安 失点 四球 奪三振`);
    for (const p of t.pitching) {
      out.push(`  ${padEnd(name(p.playerId), 16)} ${padStart(formatInnings(p.outs), 6)} ${[p.pitches, p.h, p.r, p.bb, p.k].map((v) => padStart(String(v), 4)).join(' ')}`);
    }
    if (t.fielding.length > 0) {
      out.push(`  失策: ${t.fielding.map((f) => `${name(f.playerId)} ${f.e}`).join('、')}`);
    }
    out.push('');
  }
  return out.join('\n');
}
