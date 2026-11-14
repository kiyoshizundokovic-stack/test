/**
 * ゲーム全体の数値定数。
 * バランス調整・エンドレスモード（上限撤廃）に備え、能力値の上下限や生成パラメータは
 * すべてここで定義し、ロジック側にハードコードしないこと。
 */

/** 野手能力（ミート・パワー・走力・送球・守備力・捕球・選球眼・盗塁）の下限・上限 */
export const FIELDER_ABILITY_MIN = 1;
export const FIELDER_ABILITY_MAX = 100;

/** 賢さ（全選手共通） */
export const WISDOM_MIN = 1;
export const WISDOM_MAX = 100;

/** 球速。能力値 = km/h − VELOCITY_BASE_KMH（121km/h=1 〜 170km/h=50） */
export const VELOCITY_BASE_KMH = 120;
export const VELOCITY_MIN_KMH = 121;
export const VELOCITY_MAX_KMH = 170;

/** クイック（1〜50の50段階） */
export const QUICK_MIN = 1;
export const QUICK_MAX = 50;

/** コントロール */
export const CONTROL_MIN = 1;
export const CONTROL_MAX = 100;

/** スタミナ = 投げられる球数そのもの */
export const STAMINA_MIN = 30;
export const STAMINA_MAX = 150;

/** 球種（評価値は1〜10。球種合計の最大は5球種×10＝50、総合力では×3で最大150） */
export const PITCH_COUNT_MIN = 1;
export const PITCH_COUNT_MAX = 5;
export const PITCH_RATING_MIN = 1;
export const PITCH_RATING_MAX = 10;

/** 野手能力の数 */
export const FIELDER_ABILITY_COUNT = 8;

/**
 * 総合力の倍率（SPEC 2.3）。
 * 総合力 = 野手8能力×fielder + 賢さ×wisdom + (km/h−120)×velocity + クイック×quick
 *        + 球種合計×pitches + コントロール×control + スタミナ×stamina
 */
export const OVERALL_WEIGHTS = {
  fielder: 1,
  wisdom: 1,
  velocity: 3,
  quick: 1,
  pitches: 3,
  control: 1,
  stamina: 1,
} as const;

/** 総合力の理論上の最大値（各能力の上限と倍率から算出。上限変更に追従する）＝1500 */
export const OVERALL_MAX =
  FIELDER_ABILITY_MAX * FIELDER_ABILITY_COUNT * OVERALL_WEIGHTS.fielder +
  WISDOM_MAX * OVERALL_WEIGHTS.wisdom +
  (VELOCITY_MAX_KMH - VELOCITY_BASE_KMH) * OVERALL_WEIGHTS.velocity +
  QUICK_MAX * OVERALL_WEIGHTS.quick +
  PITCH_RATING_MAX * PITCH_COUNT_MAX * OVERALL_WEIGHTS.pitches +
  CONTROL_MAX * OVERALL_WEIGHTS.control +
  STAMINA_MAX * OVERALL_WEIGHTS.stamina;

/** チーム */
export const INITIAL_ROSTER_SIZE = 9;
export const MAX_ROSTER_SIZE = 12;
export const MIN_ROSTER_SIZE = 9;
export const INITIAL_POINTS = 500;
export const INITIAL_LIFE = 3;
export const LIFE_PRICE = 1000;

/** ストック（SPEC 7） */
export const STOCK = {
  /** ストックの上限。超えている間はニューゲームを開始できない */
  max: 200,
  /** ニューゲームでストックから連れて行ける人数 */
  pickMax: 3,
  /** 名前（姓・名それぞれ）の文字数の上限 */
  nameMaxLength: 8,
} as const;
/** 勝利ポイント = 相手選手の総合力の平均 × この値（端数は WIN_POINT_ROUNDING で処理） */
export const WIN_POINT_RATIO = 1 / 10;
/** 勝利ポイントの端数処理 */
export const WIN_POINT_ROUNDING: 'floor' | 'round' | 'ceil' = 'floor';

/** 選手生成 */
export const PLAYER_GENERATION = {
  /** 初期選手の総合力の平均目標（最大1500の1/3） */
  initialTargetOverall: 500,
  /** 選手ごとの目標総合力のばらつき（目標値に対する比率の標準偏差） */
  overallSpreadRatio: 0.15,
  /** 選手ごとの目標総合力の下限・上限（目標値に対する比率。500なら300〜700） */
  overallClampRatio: { min: 0.6, max: 1.4 },
  /** 能力ごとのばらつき（基準値に対する比率の標準偏差） */
  abilitySpreadRatio: 0.22,
  /** 球種数の決定：球種合計 / この値 を中心に ±1 程度で決める */
  pitchValuePerPitch: 6,
} as const;

/**
 * 選手のタイプ（個性）。各能力の「基準値（上限に対する比率）」への倍率。
 * 倍率は生成時に総合力が目標に合うよう正規化されるので、相対的な大小だけが意味を持つ。
 */
export type ArchetypeWeights = {
  contact: number;
  power: number;
  speed: number;
  arm: number;
  fielding: number;
  catching: number;
  eye: number;
  steal: number;
  wisdom: number;
  velocity: number;
  quick: number;
  control: number;
  stamina: number;
  pitches: number;
};

export const ARCHETYPES: Record<string, { label: string; weight: number; mult: ArchetypeWeights }> = {
  slugger: {
    label: '強打型',
    weight: 2,
    mult: { contact: 1.3, power: 1.6, speed: 0.8, arm: 1.0, fielding: 0.8, catching: 0.9, eye: 1.1, steal: 0.6, wisdom: 0.9, velocity: 0.7, quick: 0.7, control: 0.7, stamina: 0.7, pitches: 0.6 },
  },
  contact: {
    label: '巧打型',
    weight: 2,
    mult: { contact: 1.6, power: 0.8, speed: 1.3, arm: 0.9, fielding: 1.0, catching: 1.0, eye: 1.4, steal: 1.1, wisdom: 1.2, velocity: 0.7, quick: 0.7, control: 0.8, stamina: 0.7, pitches: 0.6 },
  },
  speedster: {
    label: '俊足型',
    weight: 1,
    mult: { contact: 1.1, power: 0.6, speed: 1.7, arm: 1.0, fielding: 1.2, catching: 1.0, eye: 1.0, steal: 1.8, wisdom: 1.1, velocity: 0.7, quick: 0.7, control: 0.7, stamina: 0.7, pitches: 0.6 },
  },
  defense: {
    label: '守備型',
    weight: 2,
    mult: { contact: 0.8, power: 0.7, speed: 1.2, arm: 1.5, fielding: 1.6, catching: 1.5, eye: 0.9, steal: 0.9, wisdom: 1.3, velocity: 0.8, quick: 0.8, control: 0.8, stamina: 0.7, pitches: 0.6 },
  },
  pitcher: {
    label: '投手型',
    weight: 3,
    mult: { contact: 0.6, power: 0.6, speed: 0.7, arm: 1.1, fielding: 0.8, catching: 0.8, eye: 0.6, steal: 0.5, wisdom: 1.1, velocity: 1.6, quick: 1.4, control: 1.5, stamina: 1.6, pitches: 1.8 },
  },
  balanced: {
    label: 'バランス型',
    weight: 2,
    mult: { contact: 1, power: 1, speed: 1, arm: 1, fielding: 1, catching: 1, eye: 1, steal: 1, wisdom: 1, velocity: 1, quick: 1, control: 1, stamina: 1, pitches: 1 },
  },
};

/** 表示用ランク（パワプロ風）。下限値の降順。上限超え（エンドレス）でも S として扱う */
export const RANK_THRESHOLDS: ReadonlyArray<{ rank: string; min: number }> = [
  { rank: 'S', min: 90 },
  { rank: 'A', min: 80 },
  { rank: 'B', min: 70 },
  { rank: 'C', min: 60 },
  { rank: 'D', min: 50 },
  { rank: 'E', min: 40 },
  { rank: 'F', min: 20 },
  { rank: 'G', min: 0 },
];
/** クイック（1〜50）は値×この倍率でランクを付ける */
export const QUICK_RANK_SCALE = 2;

// ---------------------------------------------------------------------------
// 試合（フェーズ2）
// 確率式の多くは「能力の上限比（0〜1）− 基準値 BASELINE」に係数を掛けて基準確率に足す形。
// 攻守の係数の合計はおおむね揃える（同程度のチーム同士なら強さの段階によらず成績が近くなるように）。
// BASELINE は平均的な選手（上限の1/3）を表す。係数はバランス検証（npm run balance）で調整する。
// ---------------------------------------------------------------------------

export const GAME_INNINGS = 9;
export const OUTS_PER_INNING = 3;

/** 平均的な能力値（上限に対する比率） */
export const BASELINE = 1 / 3;

/** 打席結果（三振・四球・打球種類）の抽選 */
export const PLATE = {
  /**
   * 三振率 = base + vel*(球速) + stuff*(球種合計) − contact*(ミート) − eye*(選球眼) − wisdom*(賢さの差)
   * 投手側(vel+stuff)と打者側(contact+eye)の係数はおおむね揃える。先発は12人中で最も投手能力の高い選手が
   * 選ばれ平均より上振れするため、投手側をやや小さくして強さの段階による変化を抑えている
   * 賢さの差 = 打者の賢さ − 守備側（投手と捕手の高い方）の賢さ（攻守の重み1:1）
   */
  strikeout: { base: 0.163, vel: 0.13, stuff: 0.13, contact: 0.3, eye: 0.1, wisdom: 0.06, min: 0.03, max: 0.55 },
  /** 四球率 = base − control*(コントロール) + eye*(選球眼) + wisdom*(賢さの差) */
  walk: { base: 0.085, control: 0.08, eye: 0.12, wisdom: 0.03, min: 0.015, max: 0.3 },
  /** 打球種類の重み（投手の球種はゴロを増やし、打者のパワーはフライを増やす） */
  battedBall: {
    groundBall: { base: 0.44, stuff: 0.25, power: 0.25 },
    lineDrive: { base: 0.21, contact: 0.12, stuff: 0.12 },
    flyBall: { base: 0.35, power: 0.25, stuff: 0.25 },
    minWeight: 0.05,
  },
} as const;

/** 1打席の球数 = 結果ごとの最低球数 + 追加球数（試行数 trials の二項分布、平均 extraMean） */
export const PITCHES_PER_PA = {
  strikeout: { min: 3, extraMean: 2.0 },
  walk: { min: 4, extraMean: 1.6 },
  inPlay: { min: 1, extraMean: 2.4 },
  trials: 6,
  /** extraMean × (1 + control × (BASELINE − 制球) + eye × (選球眼 − BASELINE))。制球が低いほど・打者の選球眼が高いほど増える */
  control: 0.8,
  eye: 1.2,
} as const;

/** 球数上限超過後の能力低下（最後の投手が続投する場合）。1球ごとの低下率と下限倍率 */
export const FATIGUE = { perPitchOver: 0.01, minMultiplier: 0.4 } as const;

/** 打球ゾーンの出現重み（本塁打は別抽選）。ゴロの外野ゾーンは「内野を抜けた打球」で必ず安打 */
export const ZONE_WEIGHTS = {
  groundBall: { P: 6, C: 1, '1B': 14, '2B': 22, '3B': 19, SS: 25, LF: 4, CF: 5, RF: 4 },
  lineDrive: { P: 3, C: 0, '1B': 7, '2B': 9, '3B': 8, SS: 9, LF: 21, CF: 22, RF: 21 },
  flyBall: { P: 2, C: 3, '1B': 5, '2B': 7, '3B': 6, SS: 7, LF: 22, CF: 26, RF: 22 },
} as const;

/** 本塁打率（フライ・ライナーのみ）= base × exp(power*(パワー) − pitcher*((球速+球種)/2)) */
export const HOME_RUN = {
  flyBall: 0.09,
  lineDrive: 0.028,
  power: 3,
  pitcher: 2.0,
  max: 0.5,
} as const;

/**
 * 打球がアウトになる確率（守備者の能力 vs 打者）。
 * wisdom は守備者の賢さ（BASELINE との差）でアウト率を上げる小さな補正（SPEC 3.2）
 */
export const FIELDING = {
  wisdom: 0.04,
  /** 内野ゴロ：守備力（到達）＋送球 vs 打者の走力・ミート（打球の強さ） */
  groundBall: { base: 0.83, fielding: 0.3, arm: 0.2, speed: 0.3, contact: 0.2, min: 0.4, max: 0.95 },
  /** ライナー：捕球（＋守備力） vs 打者のミート・パワー */
  lineDrive: { base: 0.39, catching: 0.3, fielding: 0.15, contact: 0.25, power: 0.2, min: 0.08, max: 0.7 },
  /** 内野フライ */
  infieldFly: { base: 0.96, catching: 0.1, min: 0.85, max: 0.995 },
  /** 外野フライ：守備力（到達）＋捕球 vs 打者のパワー・ミート */
  outfieldFly: { base: 0.865, fielding: 0.25, catching: 0.2, power: 0.25, contact: 0.2, min: 0.55, max: 0.97 },
} as const;

/** 安打の種類（単打/二塁打/三塁打）。wisdom は守備者の賢さで長打を抑える小さな補正 */
export const EXTRA_BASE = {
  wisdom: 0.06,
  /** 外野へ抜けたゴロ */
  groundBall: { double: 0.1, triple: 0, speed: 0.1, arm: 0.1 },
  lineDrive: { double: 0.55, triple: 0.02, speed: 0.25, arm: 0.2, power: 0.2 },
  flyBall: { double: 0.7, triple: 0.1, speed: 0.3, arm: 0.2, power: 0.2 },
} as const;

/** 走塁（進塁を狙ったときの成功率）= base + speed*(走者の走力) − arm*(送球者の送球) */
export const RUNNING = {
  advance: { base: 0.9, speed: 0.4, arm: 0.35, min: 0.5, max: 0.99 },
  tagUp: { base: 0.9, speed: 0.35, arm: 0.3, min: 0.5, max: 0.99 },
  /** 併殺率（無死・一死で一塁走者ありのゴロアウト）= base + arm*(送球) − speed*(打者走力) − runner*(一塁走者の走力) */
  doublePlay: { base: 0.35, arm: 0.4, speed: 0.4, runnerSpeed: 0.2, min: 0.1, max: 0.85 },
} as const;

/** 作戦AI：守備位置ごとの適性スコアの重み（守備者の能力） */
export const POSITION_FIT = {
  C: { catching: 3, arm: 2, fielding: 1, speed: 0 },
  SS: { catching: 1, arm: 2, fielding: 3, speed: 1 },
  '2B': { catching: 1, arm: 1, fielding: 3, speed: 1 },
  CF: { catching: 2, arm: 1, fielding: 3, speed: 2 },
  '3B': { catching: 1, arm: 3, fielding: 2, speed: 0 },
  RF: { catching: 2, arm: 3, fielding: 1, speed: 1 },
  LF: { catching: 2, arm: 1, fielding: 2, speed: 1 },
  '1B': { catching: 3, arm: 0, fielding: 1, speed: 0 },
} as const;
/** AIが守備位置を埋める順（重要度順） */
export const POSITION_FILL_ORDER = ['C', 'SS', '2B', 'CF', '3B', 'RF', 'LF', '1B'] as const;

/** 対戦相手 */
export const OPPONENT = {
  rosterSize: 12,
  /** 先発投手のスタミナ最低値 */
  starterMinStamina: 100,
  /** 控えから登板させる投手の数 */
  relievers: 3,
  /** 相手選手の総合力の平均（段階 n = floor((試合数−1)/10)）：通常戦 normalBase + step×n、ボス戦 bossBase + step×n */
  normalBase: 500,
  bossBase: 650,
  step: 50,
  gamesPerStage: 10,
  totalGames: 100,
} as const;

/** ボス戦勝利時の特別報酬（総合力換算で+10を基準。端数切り捨て。上限は超えない） */
export const BOSS_REWARD = {
  /** 野手8能力・賢さ・コントロール・クイック・スタミナ（球数） */
  perAbility: 10,
  /** 球速（km/h）= 10 ÷ 3 の切り捨て */
  velocityKmh: 3,
  /** 球種合計 = 10 ÷ 3 の切り捨て（所持球種からランダムに1ずつ） */
  pitchPoints: 3,
} as const;

/**
 * エラー（SPEC 3.4）。守備は「捕球 → 送球 → 受け手の捕球」の動作の連鎖で、動作ごとに判定する。
 * エラー率 = base[動作] × exp(−ability × (捕球または送球 − BASELINE) − wisdom × (賢さ − BASELINE))
 * 捕球・送球の影響が大きく、賢さは小さい。
 */
export const ERRORS = {
  base: {
    /** ゴロの捕球 */
    groundBall: 0.05,
    /** フライの捕球 */
    flyBall: 0.018,
    /** ライナーの捕球 */
    lineDrive: 0.0135,
    /** 送球 */
    throw: 0.027,
    /** 送球を受ける（受け手の捕球） */
    receive: 0.009,
  },
  ability: 4.2,
  wisdom: 1,
  max: 0.3,
  /**
   * 将来の拡張用（エラー耐性など）：賢さによるエラー率の追加補正。現在は未使用（0）
   */
  wisdomResistance: 0,
} as const;

/**
 * 盗塁（SPEC 3.5）。
 * 成功率 = base[塁] + steal*(盗塁) + speed*(走力) + wisdom*(走者の賢さ − 守備側の賢さ)
 *        − quick*(投手のクイック) − vel*(投手の球速) − arm*(捕手の送球)
 * 守備側の賢さ = 投手と捕手の高い方。走者と守備側の賢さの重みは1:1。
 * 企図の判断（見込み成功率）にも同じ式を使う。
 */
export const STEAL = {
  base: { second: 0.72, third: 0.62, home: 0.08 },
  steal: 0.45,
  speed: 0.25,
  wisdom: 0.1,
  quick: 0.2,
  vel: 0.1,
  arm: 0.25,
  min: 0.02,
  max: 0.97,
  /**
   * 本盗の上限。base が低いので通常の走者は見込み成功率が50%に届かず、企図されない。
   * 極端に盗塁能力の高い走者と弱いバッテリーの組み合わせでのみ積極盗塁のしきい値（70%）に届く
   */
  homeMax: 0.75,
  /** 積極度ごとの企図しきい値（見込み成功率がこれ以上なら企図） */
  threshold: { normal: 0.8, aggressive: 0.7 },
} as const;

/** バランス目標値（同程度の能力同士、1チーム1試合あたり。SPEC 9） */
export const BALANCE_TARGETS = {
  runs: { min: 3.5, max: 4.5 },
  avg: { min: 0.24, max: 0.26 },
  homeRuns: { min: 0.7, max: 1.0 },
  strikeoutRate: { min: 0.18, max: 0.22 },
  walkRate: { min: 0.07, max: 0.09 },
  pitches: { min: 130, max: 150 },
} as const;

/**
 * 走者が先の塁を狙う試行確率（プレー前のアウトカウント 0,1,2 別）。
 * どの場面で誰が狙うかの構造は src/core/game/runnerTable.ts に定義する。
 */
export const RUNNER_ATTEMPTS = {
  /** 単打で二塁走者が本塁を狙う */
  singleSecondToHome: [0.7, 0.75, 0.95],
  /** 単打で一塁走者が三塁を狙う */
  singleFirstToThird: [0.35, 0.35, 0.45],
  /** 二塁打で一塁走者が本塁を狙う */
  doubleFirstToHome: [0.5, 0.55, 0.8],
  /** ゴロアウトで三塁走者が本塁を狙う */
  groundOutThirdToHome: [0.5, 0.5, 0],
  /** ゴロアウトで二塁走者が三塁へ進む（アウトのリスクなし） */
  groundOutSecondToThird: [0.6, 0.6, 0],
  /** 外野フライで三塁走者がタッチアップ */
  flyOutThirdToHome: [0.9, 0.9, 0],
  /** 外野フライで二塁走者がタッチアップ */
  flyOutSecondToThird: [0.3, 0.3, 0],
} as const satisfies Record<string, readonly [number, number, number]>;
