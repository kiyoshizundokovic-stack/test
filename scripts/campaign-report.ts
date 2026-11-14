/**
 * 繰り返しプレイの難易度検証レポート（フェーズ7c。分析専用・ゲームの数値は変えない）。
 * ストックを持ち越しながら繰り返しプレイするボットで、初回プレイの到達試合数と初完走までのプレイ回数を測り、
 * 調整案を比較して docs/campaign-report.md に書き出す。
 *   npm run campaign-report              # 各200キャンペーン（数分〜十数分。4並列）
 *   npm run campaign-report -- quick     # 各40キャンペーン（書き出さない）
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { DEFAULT_RULES, POLICY_LABELS, simulateCampaigns, type CampaignStats, type ReinforcePolicy, type RunRules } from '../src/core/analysis';

interface Job {
  label: string;
  rules: Partial<RunRules>;
  plan: 'optimized' | 'ai';
  policy: ReinforcePolicy;
}

const MAX_PLAYS = 40;

// ---- ワーカー：1つの条件を計算して JSON を出力する ----
if (process.argv[2] === '--worker') {
  const job = JSON.parse(process.argv[3]!) as Job;
  const count = Number(process.argv[4]);
  const stats = simulateCampaigns(count, 1, { run: { plan: job.plan, reinforce: job.policy }, picks: 3 }, { ...DEFAULT_RULES, ...job.rules }, MAX_PLAYS);
  process.stdout.write(JSON.stringify(stats));
  process.exit(0);
}

const quick = process.argv[2] === 'quick';
const COUNT = quick ? 40 : 200;
const PARALLEL = 4;

const A: Partial<RunRules> = { normalBase: 400, bossBase: 500, step: 75 };
const B: Partial<RunRules> = { normalBase: 400, bossBase: 525, step: 80, initialLife: 4 };
const C: Partial<RunRules> = { normalBase: 425, bossBase: 525, step: 70 };
const jobs: Job[] = [
  { label: '現仕様（基準）', rules: {}, plan: 'optimized', policy: 'playerFirst' },
  { label: '初期ライフ5', rules: { initialLife: 5 }, plan: 'optimized', policy: 'playerFirst' },
  { label: '敵の初期強さ450（ボス600）', rules: { normalBase: 450, bossBase: 600 }, plan: 'optimized', policy: 'playerFirst' },
  { label: 'ボス戦の上乗せを+100（ボス600）', rules: { bossBase: 600 }, plan: 'optimized', policy: 'playerFirst' },
  { label: '敵の上昇幅+60', rules: { step: 60 }, plan: 'optimized', policy: 'playerFirst' },
  { label: '**案A**：通常400・ボス500・上昇+75', rules: A, plan: 'optimized', policy: 'playerFirst' },
  { label: '**案B**：通常400・ボス525・上昇+80・初期ライフ4', rules: B, plan: 'optimized', policy: 'playerFirst' },
  { label: '**案C**：通常425・ボス525・上昇+70', rules: C, plan: 'optimized', policy: 'playerFirst' },
  { label: '案A・バランス方針', rules: A, plan: 'optimized', policy: 'balanced' },
  { label: '案A・ライフ優先方針', rules: A, plan: 'optimized', policy: 'lifeFirst' },
  { label: '案A・作戦は敵AIと同じ（不慣れなプレイヤー）', rules: A, plan: 'ai', policy: 'playerFirst' },
  { label: '案B・バランス方針', rules: B, plan: 'optimized', policy: 'balanced' },
  { label: '案B・ライフ優先方針', rules: B, plan: 'optimized', policy: 'lifeFirst' },
  { label: '案B・作戦は敵AIと同じ（不慣れなプレイヤー）', rules: B, plan: 'ai', policy: 'playerFirst' },
  { label: '現仕様・作戦は敵AIと同じ（不慣れなプレイヤー）', rules: {}, plan: 'ai', policy: 'playerFirst' },
];

function runWorker(job: Job): Promise<CampaignStats> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, '--worker', JSON.stringify(job), String(COUNT)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('exit', (code) => (code === 0 ? resolve(JSON.parse(out) as CampaignStats) : reject(new Error(`worker failed: ${job.label}`))));
  });
}

async function main() {
  const t0 = Date.now();
  const results: CampaignStats[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await runWorker(jobs[i]!);
        console.error(`done: ${jobs[i]!.label}`);
      }
    }),
  );

  const out: string[] = [];
  const log = (s = '') => {
    out.push(s);
    console.log(s);
  };
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const n = (x: number | null) => (x === null ? `${MAX_PLAYS}回超` : String(x));

  log('# 繰り返しプレイの難易度検証レポート（フェーズ7c）');
  log();
  log(`- 生成: \`npm run campaign-report\`（各${COUNT}キャンペーン、1キャンペーンは最大${MAX_PLAYS}プレイ）`);
  log('- ゲームの仕様・数値は変更していない（各案はシミュレーター上の比較）。ボットは `src/core/analysis/campaign.ts`');
  log('- 目標（SPEC 5.7）：ストックなしの初回プレイは**10〜30戦程度**で終了し、**10〜20回目くらいのプレイで初完走**');
  log();
  log('## ボットの動き');
  log();
  log('- **1回のプレイ**：`simulateRun`（run.ts と同じ結果になることをテスト済み。ストックから連れて行った選手の制限も同じ）');
  log('- **作戦**：最適化した作戦（`optimizedPlan`）。比較用に「敵AIと同じ作戦」（不慣れなプレイヤーの想定）も測る');
  log(`- **補強**：${POLICY_LABELS.playerFirst}（ライフ1のときだけライフを買い、あとは相手の最強選手を獲得。ストックの選手は売らない）。比較用に${POLICY_LABELS.balanced}・${POLICY_LABELS.lifeFirst}も測る`);
  log('- **ボス報酬**：ストック以外で総合力の最も高い選手。**通常戦の敗北・引き分け**：次戦に進む。**ボス戦**：勝つまで再戦');
  log('- **ストック**：ゲーム終了時に保有選手を全員ストックへ（上限200人。超えたら総合力の低い順に外す）。ニューゲームでは総合力の上位3人を連れて行く');
  log();
  log('## 結果');
  log();
  log('| 条件 | 初回プレイの到達試合数 中央値（25%〜75%） | 初完走までのプレイ回数 中央値（25%〜75%） | 10回以内に完走 | 20回以内に完走 | 40回以内に完走 |');
  log('|---|---|---|---|---|---|');
  jobs.forEach((j, i) => {
    const r = results[i]!;
    const f = r.firstPlay;
    const c = r.firstCompletion;
    log(
      `| ${j.label} | ${f.p50}（${f.p25}〜${f.p75}） | ${n(c.p50)}（${n(c.p25)}〜${n(c.p75)}） | ${pct(c.within10)} | ${pct(c.within20)} | ${pct(c.completedShare)} |`,
    );
  });
  log();
  log('## ストックの育ち方（連れて行く3人の総合力の平均、プレイ回数ごと）');
  log();
  const cps = Object.keys(results[0]!.pickAverageByPlay);
  log(`| 条件 | ${cps.map((k) => `${k}回目`).join(' | ')} |`);
  log(`|---|${cps.map(() => '---').join('|')}|`);
  jobs.forEach((j, i) => {
    if (!/基準|案A\*\*|案B\*\*|案C\*\*/.test(j.label)) return;
    const r = results[i]!;
    log(`| ${j.label} | ${cps.map((k) => (Number.isNaN(r.pickAverageByPlay[Number(k)]!) ? '-' : r.pickAverageByPlay[Number(k)]!.toFixed(0))).join(' | ')} |`);
  });
  log();
  log('（完走したキャンペーンはそこで終わるため、後半のプレイ回数ほど「まだ完走していないキャンペーン」だけの平均になる）');
  log();
  log(`（所要時間 ${((Date.now() - t0) / 1000).toFixed(0)}秒）`);
  if (!quick) writeFileSync(new URL('../docs/campaign-report.md', import.meta.url), out.join('\n') + '\n');
}

void main();
