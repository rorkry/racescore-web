/**
 * 展開予想 v2 の入力型（サーバー内部専用）
 *
 * 設計方針:
 *  1. 「値」と「信頼度」を必ず分離する（MetricValue）。
 *     legacy は欠損に default 50 を「値」として与えたため、指数欠損馬が
 *     実データを持つ馬より有利になっていた（docs/RACE_FORECAST_AUDIT_PHASE0.md §0(2)）。
 *     v2 では欠損は「neutral値 + reliability 0」で表現し、値そのものでは得しない。
 *
 *  2. 過去1走の情報は PastRaceSample 1オブジェクトに閉じ込める。
 *     legacy は corner1..4 を独立配列で保持し index で横結合していたため、
 *     配列長が揃わず別レースの値を結合しうる desync バグがあった
 *     （data-fetcher.ts:152-156, 319-322）。
 *     並列配列（last3fSamples: number[] 等）を使わないことで構造的に防ぐ。
 *
 *  3. 0 と欠損を区別する。null = 欠損、0 = 実測値0。
 *
 * DB schema は変更しない。既存の型・API も変更しない。
 */

export type Surface = '芝' | 'ダ';

/** 値の出所。explainability と信頼度計算に使う */
export type Provenance =
  | 'indices' // indices テーブル
  | 'umadata' // umadata テーブル
  | 'wakujun' // 当日出走表
  | 'competition-score' // 共有 competition score service
  | 'course-geometry' // lib/racecourse-geometry
  | 'derived' // 上記から計算
  | 'missing';

/** 欠損の理由。「なぜ低信頼度なのか」を説明できるようにする */
export type MissingReason =
  | 'no-past-race' // 過去走そのものが無い
  | 'column-empty' // 列が空
  | 'unparsable' // パースできない
  | 'out-of-range' // 明らかな異常値（winsorize でも救えない）
  | 'abnormal-finish' // 中止・除外・取消（着順99扱い）→ 着順として使えない
  | 'not-applicable' // このレース条件では該当しない
  | 'direction-unknown' // 指標の有利方向が未確定（例: 方向未確定時の L4F）
  | 'insufficient-field'; // レース内比較に必要な有効頭数が足りない

/**
 * 正規化済みの指標値。
 * value は必ず [0,1]、良いほど1、neutral は 0.5。NaN を持たない。
 */
export interface MetricValue {
  /** [0,1]。良いほど1・悪いほど0・neutral 0.5 */
  value: number;
  /** [0,1]。0 = 全く信頼できない（欠損）、1 = 十分なサンプル */
  reliability: number;
  provenance: Provenance;
  /** この値の根拠になった過去走数（レース内比較のみの指標は 1） */
  sampleCount: number;
  /** 欠損・低信頼度の理由（value が neutral のときに設定） */
  missingReason?: MissingReason;
  /** デバッグ表示用の生値（正規化前）。null = 欠損 */
  raw?: number | null;
}

/** 欠損を表す MetricValue を作る（neutral 0.5 + reliability 0） */
export function missingMetric(
  reason: MissingReason,
  provenance: Provenance = 'missing'
): MetricValue {
  return {
    value: 0.5,
    reliability: 0,
    provenance,
    sampleCount: 0,
    missingReason: reason,
    raw: null,
  };
}

/**
 * 過去1走の観測。umadata 1行 + 同一レース・同一馬の indices 1行から構築する。
 * 1レースの情報が1オブジェクトに閉じているため、index 横結合による desync が起きない。
 */
export interface PastRaceSample {
  /** umadata.race_id（16桁・馬番なし） */
  raceId: string;
  /** YYYYMMDD。recency weighting と未来情報の混入防止に使う */
  dateNumber: number;

  // ---- レース条件 ----
  fieldSize: number | null;
  distanceMeters: number | null;
  surface: Surface | null;
  place: string | null;
  /** 馬場状態（良/稍重/重/不良） */
  trackCondition: string | null;
  className: string | null;
  /** course_type（「芝(内・外)」等）。充足率15.5%なので欠損前提で扱う */
  courseType: string | null;

  // ---- 結果 ----
  /**
   * 着順（1始まり）。
   * 中止・除外・取消は null（parseFinishPosition の 99 を着順として使ってはいけない）。
   */
  finishPosition: number | null;
  /** 中止・除外・取消だったか */
  abnormalFinish: boolean;
  /** 着差。勝ち馬は負値（勝ち幅）、それ以外は正値（先頭からの差）。小さいほど良い */
  marginSeconds: number | null;

  // ---- ペース・後半 ----
  /** 上がり3F（秒）。小さいほど速い。充足率99.2% */
  last3fSeconds: number | null;
  /** PCI。ペース判定に使う。充足率96.3% */
  pci: number | null;
  /** RPCI。充足率96.9% */
  rpci: number | null;

  // ---- 通過順位（右詰め格納に対応） ----
  /**
   * corner_1..corner_4 の生の通過順位。
   * DBは「最後のN個のコーナー」を右詰めで格納する（実測: "--34" 396k / "1234" 368k / "-234" 48k）。
   * したがって配列先頭が常に1角とは限らない。null = そのコーナーが存在しない。
   */
  corners: [number | null, number | null, number | null, number | null];
  /** 最初に埋まっているコーナーの通過順位 = 前半の位置取り指標 */
  firstCornerPosition: number | null;
  /** 4角（最後のコーナー）の通過順位 = 直線入口の位置 */
  lastCornerPosition: number | null;

  // ---- 指数（同一レース・同一馬の indices 行） ----
  /** 後半4F（秒）。小さいほど速い。※方向はDB実測で確定（corr(L4F,last_3f)=0.98） */
  l4fSeconds: number | null;
  /** 前半2F（秒）。小さいほど速い */
  t2fSeconds: number | null;
  /** 過去先行力。実測レンジ 3.0〜81.2 / 中央値 42.3（0-100系）。大きいほど先行 */
  pfsPast: number | null;
  /** ポテンシャル指数。実測 0〜7.8 / 中央値 3.7。大きいほど良い */
  potential: number | null;
  /** 巻き返し指数。実測 0〜10 / 中央値 0（57.8%が0）。大きいほど良い */
  makikaeshi: number | null;
  /** クッション値。実測 6.2〜11.6 / 中央値 9.3 */
  cushion: number | null;
  /** 4角コース取り 0=最内〜4=大外 */
  cornerLane: number | null;
}

/** 競うスコアの内部成分（Phase へ排他配分するために使う） */
export interface CompetitionBreakdownV2 {
  total: number;
  /** 前半へ配分: 通過順位×ペース成分 */
  passing: number;
  paceSync: number;
  /** 道中へ配分: potential・位置改善・コース適性 */
  potential: number;
  positionImprovement: number;
  courseFit: number;
  /** 後半へ配分: 巻き返し・着差・前走着順・クラスタタイム */
  comeback: number;
  margin: number;
  finish: number;
  cluster: number;
  penalty: number;
}

/** 当日のレース条件 */
export interface RaceConditionV2 {
  raceKey: string;
  distanceMeters: number;
  surface: Surface;
  place: string;
  fieldSize: number;
  trackCondition: string | null;
  /** 内回り/外回り。geometry から解決した route */
  route: string | null;
}

/** 1頭分の v2 入力 */
export interface ForecastHorseInputV2 {
  horseNumber: number;
  horseName: string;
  /** 枠番（1..8）。umaban とは別物 */
  gateNumber: number | null;
  /** 斤量 */
  weightCarried: number | null;

  /**
   * 過去走（新しい順）。重複除去済み。
   * 実測で umadata は (race_id, umaban) に最大30件の重複があるため、
   * 構築時に必ず重複除去すること（重複を残すと recency weighting が破壊される）。
   */
  pastRaces: PastRaceSample[];

  /** 競うスコア（0-100）。総合信頼度としてのみ使い、成分は breakdown から配分する */
  competitionScore?: number;
  competitionBreakdown?: CompetitionBreakdownV2;
}

/** レース全体の v2 入力 */
export interface ForecastRaceInputV2 {
  condition: RaceConditionV2;
  horses: ForecastHorseInputV2[];
}

/** 各 Phase の出力に共通する形 */
export interface PhaseScore {
  /** [0,1]。良いほど1 */
  score: number;
  /** [0,1] */
  reliability: number;
  /** 各 factor の寄与（合計が score に一致するように作る） */
  contributions: FactorContribution[];
}

export interface FactorContribution {
  label: string;
  /** score への寄与量（正負） */
  contribution: number;
  /** 正規化後の素の値 [0,1] */
  normalized: number;
  reliability: number;
  provenance: Provenance;
  missingReason?: MissingReason;
}

/** L4F の有利方向。DB実測で確定したが、設定で無効化できるようにしておく */
export type L4fDirection = 'lower-is-better' | 'higher-is-better' | 'disabled';
