/**
 * early / mid / late モデルと統合の単体テスト
 * 実行: npx tsx lib/race-forecast-v2/phase-models.test.ts
 *
 * 監査で見つかった legacy の欠陥が v2 で再発しないことを検証する:
 *  - S級/平均/最低の入力で必ず順序差が出る（全馬100飽和しない）
 *  - 欠損馬が実データ馬より上に来ない
 *  - T2F / L4F / 上がり3F は小さいほど高評価
 *  - スローペース逃げを過大評価しない
 *  - 前半だけ速く維持力が低い馬は総合で下がる（fadeRisk）
 *  - 後半型は前半後方・後半進出になる
 *  - 単一 factor だけで極端な1着にならない
 *  - shuffle 耐性・決定論性
 */
import { computeEarlyPositionScores, bandFromFrontRatio, paceAdjustedFrontCredit } from './early-position';
import { computeMidRetentionScores, retentionOfSample, enduranceEvidenceOfSample } from './mid-race-retention';
import { computeLateKickScores } from './late-kick';
import { computeForecastV2, deterministicUnit, formatExplanationTable } from './explain';
import { computeCourseAdjustment, gateEarlyAdjustment, neutralCourseAdjustment } from './course-adjustments';
import { normalizedEarlyPace } from './pace';
import { DEFAULT_FORECAST_V2_CONFIG, type ForecastV2Config } from './config/weights';
import type { ForecastHorseInputV2, ForecastRaceInputV2, PastRaceSample, RaceConditionV2 } from './types';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  NG  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}
function section(t: string) {
  console.log(`\n--- ${t} ---`);
}
function near(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

// ============================================================
// テスト用のビルダー
// ============================================================
const CONDITION: RaceConditionV2 = {
  raceKey: '2026072905010111',
  distanceMeters: 1600,
  surface: '芝',
  place: '東京',
  fieldSize: 8,
  trackCondition: '良',
  route: 'main',
};

function pastRace(over: Partial<PastRaceSample> = {}): PastRaceSample {
  return {
    raceId: 'r1',
    dateNumber: 20260501,
    fieldSize: 16,
    distanceMeters: 1600,
    surface: '芝',
    place: '東京',
    trackCondition: '良',
    className: '3勝',
    courseType: null,
    finishPosition: 8,
    abnormalFinish: false,
    marginSeconds: 1.0,
    last3fSeconds: 35.5,
    pci: 49,
    rpci: 49,
    corners: [null, null, 8, 8],
    firstCornerPosition: 8,
    lastCornerPosition: 8,
    l4fSeconds: 48.0,
    t2fSeconds: 24.6,
    pfsPast: 42,
    potential: 3.7,
    makikaeshi: 1.0,
    cushion: 9.3,
    cornerLane: 2,
    ...over,
  };
}

function horse(
  horseNumber: number,
  horseName: string,
  pastRaces: PastRaceSample[],
  over: Partial<ForecastHorseInputV2> = {}
): ForecastHorseInputV2 {
  return {
    horseNumber,
    horseName,
    gateNumber: Math.min(8, horseNumber),
    weightCarried: 55,
    pastRaces,
    ...over,
  };
}

/** n走分の同じ内容の過去走を作る（日付だけずらす） */
function repeat(sample: Partial<PastRaceSample>, n: number): PastRaceSample[] {
  return Array.from({ length: n }, (_, i) =>
    pastRace({ ...sample, raceId: `r${i}`, dateNumber: 20260501 - i * 100 })
  );
}

// ============================================================
section('ペース正規化');
// ============================================================
{
  // 芝1600: 超ハイ<=46 / 超スロー>=52
  const high = normalizedEarlyPace(44, '芝', 1600);
  const mid = normalizedEarlyPace(49, '芝', 1600);
  const slow = normalizedEarlyPace(54, '芝', 1600);
  check('低PCI = ハイペース = 1', near(high!, 1), String(high));
  check('高PCI = スロー = 0', near(slow!, 0), String(slow));
  check('中間は 0 と 1 の間', mid! > 0 && mid! < 1, String(mid));
  check('ダートは別基準（ダ1200のPCI44はスロー寄り）', normalizedEarlyPace(44, 'ダ', 1200)! < normalizedEarlyPace(44, '芝', 1600)!);
  check('欠損は null', normalizedEarlyPace(null, '芝', 1600) === null);
  check('範囲外(PCI=2.8)は null', normalizedEarlyPace(2.8, '芝', 1600) === null);
}

// ============================================================
section('paceAdjustedFrontCredit（スロー逃げを過大評価しない）');
// ============================================================
{
  const cfg = DEFAULT_FORECAST_V2_CONFIG.earlyModel;
  const highPaceFront = paceAdjustedFrontCredit(1.0, 1.0, cfg)!;
  const slowPaceFront = paceAdjustedFrontCredit(1.0, 0.0, cfg)!;
  check('ハイペース逃げ > スロー逃げ', highPaceFront > slowPaceFront, `${highPaceFront.toFixed(3)} vs ${slowPaceFront.toFixed(3)}`);
  check('ハイペース逃げは満額 1.0', near(highPaceFront, 1));
  check('スロー逃げは割引される', slowPaceFront < 0.8, slowPaceFront.toFixed(3));

  // 後方追走はペースで増減しない（先行力の証拠にしない）
  const rearHigh = paceAdjustedFrontCredit(0.1, 1.0, cfg)!;
  const rearSlow = paceAdjustedFrontCredit(0.1, 0.0, cfg)!;
  check('後方追走はペースに影響されない', near(rearHigh, rearSlow), `${rearHigh} vs ${rearSlow}`);
  check('後方追走は低評価のまま', rearHigh < 0.2);
  check('出力は常に [0,1]', highPaceFront <= 1 && slowPaceFront >= 0);
  check('欠損は null', paceAdjustedFrontCredit(null, 1, cfg) === null);
}

// ============================================================
section('脚質帯');
// ============================================================
{
  const e = DEFAULT_FORECAST_V2_CONFIG.earlyModel.bandEdges;
  check('frontRatio 1.0 → 逃げ', bandFromFrontRatio(1.0, e) === 'escape');
  check('frontRatio 0.7 → 先行', bandFromFrontRatio(0.7, e) === 'front');
  check('frontRatio 0.4 → 差し', bandFromFrontRatio(0.4, e) === 'stalker');
  check('frontRatio 0.1 → 追込', bandFromFrontRatio(0.1, e) === 'closer');
}

// ============================================================
section('S級 / 平均 / 最低 / 欠損 で順序差が出る（飽和しないこと）');
// ============================================================
{
  const race: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      // S級: ハイペースを先行し、前半も後半も速い
      horse(1, 'S級', repeat({
        firstCornerPosition: 2, lastCornerPosition: 2, finishPosition: 1, fieldSize: 16,
        pci: 44, t2fSeconds: 22.5, l4fSeconds: 45.5, last3fSeconds: 33.8,
        pfsPast: 70, potential: 6.5, makikaeshi: 7.0, marginSeconds: -0.3,
      }, 5)),
      // 平均
      horse(2, '平均', repeat({
        firstCornerPosition: 8, lastCornerPosition: 8, finishPosition: 8, fieldSize: 16,
        pci: 49, t2fSeconds: 24.6, l4fSeconds: 48.8, last3fSeconds: 36.8,
        pfsPast: 42, potential: 3.7, makikaeshi: 0.0, marginSeconds: 1.1,
      }, 5)),
      // 最低
      horse(3, '最低', repeat({
        firstCornerPosition: 15, lastCornerPosition: 16, finishPosition: 16, fieldSize: 16,
        pci: 52, t2fSeconds: 26.5, l4fSeconds: 52.5, last3fSeconds: 39.5,
        pfsPast: 15, potential: 1.0, makikaeshi: 0.0, marginSeconds: 5.0,
      }, 5)),
      // 過去走なし（全欠損）
      horse(4, '過去走なし', []),
      // 1走だけ好走（低信頼度）
      horse(5, '1走だけ好走', repeat({
        firstCornerPosition: 2, lastCornerPosition: 2, finishPosition: 1, fieldSize: 16,
        pci: 44, t2fSeconds: 22.5, l4fSeconds: 45.5, last3fSeconds: 33.8,
        pfsPast: 70, potential: 6.5, makikaeshi: 7.0, marginSeconds: -0.3,
      }, 1)),
    ],
  };

  const r = computeForecastV2(race);
  const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
  const s = by.get(1)!, avg = by.get(2)!, low = by.get(3)!, none = by.get(4)!, one = by.get(5)!;

  check('S級 > 平均 > 最低（順序差が出る）', s.totalScore > avg.totalScore && avg.totalScore > low.totalScore,
    `S=${s.totalScore.toFixed(3)} 平均=${avg.totalScore.toFixed(3)} 最低=${low.totalScore.toFixed(3)}`);

  // legacy の飽和バグの再発防止
  const all = r.explanations.map((e) => e.totalScore);
  const uniq = new Set(all.map((v) => v.toFixed(4)));
  check('全馬が同一スコアへ飽和しない', uniq.size === all.length, `unique=${uniq.size}/${all.length}`);
  check('スコアが上限に張り付かない', all.every((v) => v < 0.99));
  check('前半スコアも飽和しない', new Set(r.explanations.map((e) => e.earlyScore.toFixed(4))).size > 1);

  // 欠損馬が有利にならない（監査 §0(2) の再発防止）
  check('欠損馬 < S級', none.totalScore < s.totalScore, `欠損=${none.totalScore.toFixed(3)} S=${s.totalScore.toFixed(3)}`);
  check('欠損馬 の予測着順が1着にならない', none.predictedFinishRank > 1, `rank=${none.predictedFinishRank}`);
  check('欠損馬の信頼度は最低', none.totalReliability < 0.1, none.totalReliability.toFixed(3));
  check('欠損馬は neutral 付近', Math.abs(none.totalScore - 0.5) < 0.12, none.totalScore.toFixed(3));

  // 1走だけの馬は5走ある S級より下（信頼度で縮退）
  check('1走だけ好走 < 5走安定のS級', one.totalScore < s.totalScore, `1走=${one.totalScore.toFixed(3)} S=${s.totalScore.toFixed(3)}`);
  check('1走だけ好走の信頼度 < S級の信頼度', one.totalReliability < s.totalReliability,
    `${one.totalReliability.toFixed(3)} vs ${s.totalReliability.toFixed(3)}`);
  check('1走だけ好走 > 最低（実績は反映される）', one.totalScore > low.totalScore);

  check('予測着順は1..nの重複なし', new Set(r.explanations.map((e) => e.predictedFinishRank)).size === race.horses.length);
  check('S級が1着予想', s.predictedFinishRank === 1, `rank=${s.predictedFinishRank}`);
}

// ============================================================
section('前半だけ速く維持力が低い馬（fadeRisk）');
// ============================================================
{
  const race: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      // 逃げるが毎回失速: 前半1番手 → ゴール14着
      horse(1, '逃げて止まる', repeat({
        firstCornerPosition: 1, lastCornerPosition: 3, finishPosition: 14, fieldSize: 16,
        pci: 45, t2fSeconds: 22.8, l4fSeconds: 51.5, last3fSeconds: 39.0,
        pfsPast: 72, potential: 2.0, makikaeshi: 0.0, marginSeconds: 4.0,
      }, 5)),
      // 前で耐える: 前半2番手 → ゴール2着
      horse(2, '前で耐える', repeat({
        firstCornerPosition: 2, lastCornerPosition: 2, finishPosition: 2, fieldSize: 16,
        pci: 45, t2fSeconds: 23.0, l4fSeconds: 47.0, last3fSeconds: 35.0,
        pfsPast: 68, potential: 5.5, makikaeshi: 3.0, marginSeconds: 0.2,
      }, 5)),
      horse(3, '平均', repeat({}, 5)),
    ],
  };

  const r = computeForecastV2(race);
  const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
  const fader = by.get(1)!, keeper = by.get(2)!, avg = by.get(3)!;

  // スコアはレース内 percentile なので絶対値ではなく相対順序で検証する
  // （3頭立ての中位馬は定義上ちょうど 0.5 になる）
  check('先行2頭はどちらも平均馬より前半が高い', fader.earlyScore > avg.earlyScore && keeper.earlyScore > avg.earlyScore,
    `逃げて止まる=${fader.earlyScore.toFixed(3)} 前で耐える=${keeper.earlyScore.toFixed(3)} 平均=${avg.earlyScore.toFixed(3)}`);
  check('維持スコア: 止まる馬 < 耐える馬', fader.midScore < keeper.midScore,
    `${fader.midScore.toFixed(3)} vs ${keeper.midScore.toFixed(3)}`);
  check('fadeRisk: 止まる馬が高い', fader.fadeRisk > keeper.fadeRisk,
    `${fader.fadeRisk.toFixed(3)} vs ${keeper.fadeRisk.toFixed(3)}`);
  check('fadeRisk > 0 が立つ', fader.fadeRisk > 0.2, fader.fadeRisk.toFixed(3));
  check('総合: 止まる馬 < 耐える馬', fader.totalScore < keeper.totalScore,
    `${fader.totalScore.toFixed(3)} vs ${keeper.totalScore.toFixed(3)}`);
  check('前半が速いだけでは1着予想にならない', fader.predictedFinishRank > 1, `rank=${fader.predictedFinishRank}`);
}

// ============================================================
section('後半型（追込馬）は前半後方・後半上位');
// ============================================================
{
  const race: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      // 追込: 前半14番手 → ゴール2着・上がり最速
      horse(1, '追込', repeat({
        firstCornerPosition: 14, lastCornerPosition: 12, finishPosition: 2, fieldSize: 16,
        pci: 52, t2fSeconds: 26.0, l4fSeconds: 45.0, last3fSeconds: 33.2,
        pfsPast: 12, potential: 5.0, makikaeshi: 8.0, marginSeconds: 0.2,
      }, 5)),
      // 逃げ: 前半1番手 → ゴール3着・上がり遅い
      horse(2, '逃げ', repeat({
        firstCornerPosition: 1, lastCornerPosition: 1, finishPosition: 3, fieldSize: 16,
        pci: 45, t2fSeconds: 22.5, l4fSeconds: 50.5, last3fSeconds: 37.8,
        pfsPast: 75, potential: 4.5, makikaeshi: 0.0, marginSeconds: 0.4,
      }, 5)),
      horse(3, '平均', repeat({}, 5)),
    ],
  };

  const r = computeForecastV2(race);
  const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
  const closer = by.get(1)!, leader = by.get(2)!;

  check('前半: 追込 < 逃げ', closer.earlyScore < leader.earlyScore,
    `${closer.earlyScore.toFixed(3)} vs ${leader.earlyScore.toFixed(3)}`);
  check('後半: 追込 > 逃げ', closer.lateScore > leader.lateScore,
    `${closer.lateScore.toFixed(3)} vs ${leader.lateScore.toFixed(3)}`);
  check('追込の予想脚質は closer/stalker', closer.expectedBand === 'closer' || closer.expectedBand === 'stalker', closer.expectedBand);
  check('逃げの予想脚質は escape/front', leader.expectedBand === 'escape' || leader.expectedBand === 'front', leader.expectedBand);
  check('追込は追い出し開始が早い（値が小さい）', closer.kickStartProgress < leader.kickStartProgress,
    `${closer.kickStartProgress.toFixed(3)} vs ${leader.kickStartProgress.toFixed(3)}`);
  check('追込の最大進出量 > 逃げ', closer.maxLateGainMeters > leader.maxLateGainMeters);
  check('隊列順位: 逃げが前', leader.expectedFormationRank < closer.expectedFormationRank,
    `逃げ=${leader.expectedFormationRank} 追込=${closer.expectedFormationRank}`);
}

// ============================================================
section('方向の検証（T2F / L4F / 上がり3F）');
// ============================================================
{
  function twoHorseRace(a: Partial<PastRaceSample>, b: Partial<PastRaceSample>) {
    return computeForecastV2({
      condition: { ...CONDITION, fieldSize: 3 },
      horses: [
        horse(1, 'A', repeat(a, 5)),
        horse(2, 'B', repeat(b, 5)),
        horse(3, '平均', repeat({}, 5)),
      ],
    });
  }

  // T2F だけ違う
  {
    const r = twoHorseRace({ t2fSeconds: 22.5 }, { t2fSeconds: 26.5 });
    const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
    check('T2F 小さい馬の前半スコアが高い', by.get(1)!.earlyScore > by.get(2)!.earlyScore,
      `${by.get(1)!.earlyScore.toFixed(3)} vs ${by.get(2)!.earlyScore.toFixed(3)}`);
  }

  // L4F だけ違う（DB実測: 小さいほど速い）
  {
    const r = twoHorseRace({ l4fSeconds: 45.0 }, { l4fSeconds: 52.0 });
    const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
    check('L4F 小さい馬の後半スコアが高い', by.get(1)!.lateScore > by.get(2)!.lateScore,
      `${by.get(1)!.lateScore.toFixed(3)} vs ${by.get(2)!.lateScore.toFixed(3)}`);
  }

  // 上がり3F だけ違う
  {
    const r = twoHorseRace({ last3fSeconds: 33.2 }, { last3fSeconds: 39.0 });
    const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
    check('上がり3F 小さい馬の後半スコアが高い', by.get(1)!.lateScore > by.get(2)!.lateScore,
      `${by.get(1)!.lateScore.toFixed(3)} vs ${by.get(2)!.lateScore.toFixed(3)}`);
  }

  // 着差だけ違う
  {
    const r = twoHorseRace({ marginSeconds: -0.2 }, { marginSeconds: 6.0 });
    const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
    check('着差 小さい馬の後半スコアが高い', by.get(1)!.lateScore > by.get(2)!.lateScore);
  }

  // L4F 無効化設定
  {
    const disabled: ForecastV2Config = {
      ...DEFAULT_FORECAST_V2_CONFIG,
      lateModel: { ...DEFAULT_FORECAST_V2_CONFIG.lateModel, l4fDirection: 'disabled' },
    };
    const race: ForecastRaceInputV2 = {
      condition: { ...CONDITION, fieldSize: 3 },
      horses: [
        horse(1, 'A', repeat({ l4fSeconds: 45.0 }, 5)),
        horse(2, 'B', repeat({ l4fSeconds: 52.0 }, 5)),
        horse(3, '平均', repeat({}, 5)),
      ],
    };
    const late = computeLateKickScores(race, undefined, neutralCourseAdjustment(), disabled);
    const f = late[0].contributions.find((c) => c.label.includes('L4F'))!;
    check('L4F 無効化時: contribution = 0', near(f.contribution, 0), String(f.contribution));
    check('L4F 無効化時: reliability = 0', near(f.reliability, 0));
    check('L4F 無効化時: 理由を記録', f.missingReason === 'direction-unknown');
  }
}

// ============================================================
section('retention / endurance の符号');
// ============================================================
{
  const mm = DEFAULT_FORECAST_V2_CONFIG.midModel;
  // 前半16番手 → ゴール1着 = 大きく押し上げた
  const gain = retentionOfSample(pastRace({ firstCornerPosition: 16, finishPosition: 1, fieldSize: 16 }), mm)!;
  // 前半1番手 → ゴール16着 = 大失速
  const lose = retentionOfSample(pastRace({ firstCornerPosition: 1, finishPosition: 16, fieldSize: 16 }), mm)!;
  const keep = retentionOfSample(pastRace({ firstCornerPosition: 5, finishPosition: 5, fieldSize: 16 }), mm)!;
  check('位置を上げた走が最高評価', gain > keep && keep > lose, `${gain.toFixed(3)} / ${keep.toFixed(3)} / ${lose.toFixed(3)}`);
  check('位置維持は中間付近', keep > 0.4 && keep < 0.7, keep.toFixed(3));
  check('中止・除外は null', retentionOfSample(pastRace({ abnormalFinish: true, finishPosition: null }), mm) === null);
  check('着順欠損は null', retentionOfSample(pastRace({ finishPosition: null }), mm) === null);

  const th = DEFAULT_FORECAST_V2_CONFIG.earlyModel.forwardThreshold;
  const hard = enduranceEvidenceOfSample(pastRace({ firstCornerPosition: 1, fieldSize: 16, pci: 44, marginSeconds: 0.1 }), th)!;
  const easy = enduranceEvidenceOfSample(pastRace({ firstCornerPosition: 1, fieldSize: 16, pci: 54, marginSeconds: 0.1 }), th)!;
  const rear = enduranceEvidenceOfSample(pastRace({ firstCornerPosition: 15, fieldSize: 16, pci: 44, marginSeconds: 0.1 }), th)!;
  check('ハイペース先行で粘った > スロー先行', hard > easy, `${hard.toFixed(3)} vs ${easy.toFixed(3)}`);
  check('後方追走は耐久実績にならない', rear < 0.05, rear.toFixed(3));
  check('出力は [0,1]', hard <= 1 && rear >= 0);
}

// ============================================================
section('コース補正（小さく・estimatedは弱く）');
// ============================================================
{
  const base = {
    geometryId: 'tokyo:turf:main', venue: 'tokyo', surface: '芝' as const, route: 'main',
    direction: 'counterclockwise' as const, distanceMeters: 1600,
    trackWidth: 41, firstCornerDistance: 550, cornerCount: 2,
    turfLeadInnerMeters: null, turfLeadOuterMeters: null, turfLeadProvenance: null,
    geometryProvenance: 'official',
  };

  // 長い直線 → 後半重視
  const longStraight = computeCourseAdjustment({ ...base, homeStraightLength: 525, elevationRange: 2.0 });
  check('長い直線 → late 倍率 > 1', longStraight.phaseMultipliers.late > 1, longStraight.phaseMultipliers.late.toFixed(3));
  check('長い直線 → straightLengthNorm が高い', longStraight.straightLengthNorm > 0.8);

  // 短い直線 → 前半・道中重視
  const shortStraight = computeCourseAdjustment({ ...base, homeStraightLength: 260, elevationRange: 1.0 });
  check('短い直線 → early 倍率 > 1', shortStraight.phaseMultipliers.early > 1);
  check('短い直線 → late 倍率 <= 1', shortStraight.phaseMultipliers.late <= 1 + 1e-9);

  // 急坂 → 維持力重視
  const steep = computeCourseAdjustment({ ...base, homeStraightLength: 310, elevationRange: 5.3 });
  check('急坂 → mid 倍率 > 1', steep.phaseMultipliers.mid > 1, steep.phaseMultipliers.mid.toFixed(3));
  check('急坂 → finishSlopeSeverity が高い', steep.finishSlopeSeverity > 0.8);

  // クランプ
  const extreme = computeCourseAdjustment({ ...base, homeStraightLength: 2000, elevationRange: 100 });
  const d = DEFAULT_FORECAST_V2_CONFIG.clamps.maxCourseMultiplierDelta;
  const all = [extreme.phaseMultipliers.early, extreme.phaseMultipliers.mid, extreme.phaseMultipliers.late];
  check('極端な入力でも倍率がクランプされる', all.every((v) => v <= 1 + d + 1e-9 && v >= 1 - d - 1e-9), JSON.stringify(all));

  // 芝スタートダート: official vs estimated
  const official = computeCourseAdjustment({
    ...base, surface: 'ダ', homeStraightLength: 501, elevationRange: 2.5,
    turfLeadInnerMeters: 150, turfLeadOuterMeters: 180, turfLeadProvenance: 'official',
  });
  const estimated = computeCourseAdjustment({
    ...base, surface: 'ダ', homeStraightLength: 501, elevationRange: 2.5,
    turfLeadInnerMeters: 150, turfLeadOuterMeters: 180, turfLeadProvenance: 'estimated',
  });
  check('芝スタートダート: 外枠有利が立つ', official.turfStartOuterAdvantage > 0, official.turfStartOuterAdvantage.toFixed(3));
  check('estimated は official より弱い', estimated.turfStartOuterAdvantage < official.turfStartOuterAdvantage,
    `est=${estimated.turfStartOuterAdvantage.toFixed(3)} off=${official.turfStartOuterAdvantage.toFixed(3)}`);
  check('補正の根拠がnotesに残る', official.notes.some((s) => s.includes('芝スタート')));

  // 枠補正
  const outer = gateEarlyAdjustment(official, 8, 16);
  const inner = gateEarlyAdjustment(official, 1, 16);
  check('芝スタートダートで外枠 > 内枠', outer > inner, `外=${outer.toFixed(4)} 内=${inner.toFixed(4)}`);
  const maxGate = DEFAULT_FORECAST_V2_CONFIG.clamps.maxGateAdjustment;
  check('枠補正が上限内', Math.abs(outer) <= maxGate + 1e-9 && Math.abs(inner) <= maxGate + 1e-9);
  check('枠番欠損なら 0', near(gateEarlyAdjustment(official, null, 16), 0));

  // 初角が近いコース → 内枠有利
  const nearCorner = computeCourseAdjustment({ ...base, homeStraightLength: 310, elevationRange: 2, firstCornerDistance: 180 });
  check('初角が近い → 内枠有利が立つ', nearCorner.innerGateAdvantage > 0.5, nearCorner.innerGateAdvantage.toFixed(3));
  check('初角が近い: 内枠 > 外枠', gateEarlyAdjustment(nearCorner, 1, 16) > gateEarlyAdjustment(nearCorner, 8, 16));

  // neutral
  const nz = neutralCourseAdjustment();
  check('neutral は倍率1・補正0', near(nz.phaseMultipliers.early, 1) && near(nz.turfStartOuterAdvantage, 0));
}

// ============================================================
section('単一 factor だけで極端な1着にならない');
// ============================================================
{
  // 上がり3Fだけ突出、他は全部最低の馬
  const race: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      horse(1, '上がりだけ最速', repeat({
        firstCornerPosition: 16, lastCornerPosition: 16, finishPosition: 16, fieldSize: 16,
        pci: 52, t2fSeconds: 27.0, l4fSeconds: 52.0, last3fSeconds: 32.0,
        pfsPast: 5, potential: 0.5, makikaeshi: 0.0, marginSeconds: 8.0,
      }, 5)),
      // 全部そこそこ良い馬
      horse(2, '総合的に良い', repeat({
        firstCornerPosition: 3, lastCornerPosition: 3, finishPosition: 2, fieldSize: 16,
        pci: 46, t2fSeconds: 23.2, l4fSeconds: 46.5, last3fSeconds: 34.8,
        pfsPast: 60, potential: 5.8, makikaeshi: 4.0, marginSeconds: 0.2,
      }, 5)),
      horse(3, '平均', repeat({}, 5)),
    ],
  };
  const r = computeForecastV2(race);
  const by = new Map(r.explanations.map((e) => [e.horseNumber, e]));
  check('単一factor突出馬 < 総合的に良い馬', by.get(1)!.totalScore < by.get(2)!.totalScore,
    `${by.get(1)!.totalScore.toFixed(3)} vs ${by.get(2)!.totalScore.toFixed(3)}`);
  check('単一factor突出馬は1着予想にならない', by.get(1)!.predictedFinishRank > 1);

  // 全 factor の寄与が上限内
  const maxC = DEFAULT_FORECAST_V2_CONFIG.clamps.maxFactorContribution;
  const allFactors = r.explanations.flatMap((e) => e.factors);
  check('全 factor の寄与が上限内', allFactors.every((f) => Math.abs(f.contribution) <= maxC + 1e-9),
    String(Math.max(...allFactors.map((f) => Math.abs(f.contribution)))));
}

// ============================================================
section('決定論性 / shuffle 耐性 / 乱数');
// ============================================================
{
  const horses = [
    horse(1, 'A', repeat({ firstCornerPosition: 2, finishPosition: 1, t2fSeconds: 23.0, last3fSeconds: 34.0 }, 5)),
    horse(2, 'B', repeat({ firstCornerPosition: 8, finishPosition: 8 }, 5)),
    horse(3, 'C', repeat({ firstCornerPosition: 14, finishPosition: 3, last3fSeconds: 33.5 }, 5)),
    horse(4, 'D', repeat({ firstCornerPosition: 5, finishPosition: 12 }, 4)),
  ];
  const race: ForecastRaceInputV2 = { condition: CONDITION, horses };

  const r1 = computeForecastV2(race);
  const r2 = computeForecastV2(race);
  check('同じ入力で同じ結果（決定論的）',
    JSON.stringify(r1.explanations) === JSON.stringify(r2.explanations));

  // shuffle
  const shuffled: ForecastRaceInputV2 = { condition: CONDITION, horses: [horses[2], horses[0], horses[3], horses[1]] };
  const rs = computeForecastV2(shuffled);
  const a = new Map(r1.explanations.map((e) => [e.horseNumber, e]));
  const b = new Map(rs.explanations.map((e) => [e.horseNumber, e]));
  let shuffleOk = true;
  for (const [hn, e] of a) {
    const o = b.get(hn)!;
    if (!near(e.totalScore, o.totalScore, 1e-12) || e.predictedFinishRank !== o.predictedFinishRank) shuffleOk = false;
  }
  check('配列順を変えても各馬の結果が不変（shuffle耐性）', shuffleOk);

  // 全馬同値
  const same: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [1, 2, 3, 4].map((i) => horse(i, `同値${i}`, repeat({}, 5))),
  };
  const rSame = computeForecastV2(same);
  const scores = rSame.explanations.map((e) => e.totalScore);
  check('全馬同値 → 全馬同スコア', scores.every((v) => near(v, scores[0], 1e-12)), JSON.stringify(scores.map((v) => v.toFixed(4))));
  check('全馬同値 → 着順は馬番で決定論的', rSame.explanations.map((e) => e.horseNumber).join(',') === '1,2,3,4');

  // 乱数
  check('既定では乱数無効（寄与0）', r1.explanations.every((e) => e.randomContribution === 0));
  const u1 = deterministicUnit('raceA', 5);
  const u2 = deterministicUnit('raceA', 5);
  const u3 = deterministicUnit('raceB', 5);
  const u4 = deterministicUnit('raceA', 6);
  check('deterministicUnit: 同一入力で同値', near(u1, u2));
  check('deterministicUnit: raceKey が違えば別値', !near(u1, u3));
  check('deterministicUnit: 馬番が違えば別値', !near(u1, u4));
  check('deterministicUnit: [0,1)', u1 >= 0 && u1 < 1);

  // 乱数を有効にしても強い能力差を逆転しない
  const withRandom: ForecastV2Config = {
    ...DEFAULT_FORECAST_V2_CONFIG,
    random: { enabled: true, maxContribution: 0.02 },
  };
  const bigGap: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      horse(1, '強', repeat({ firstCornerPosition: 2, finishPosition: 1, t2fSeconds: 22.5, l4fSeconds: 45.0, last3fSeconds: 33.5, pfsPast: 70, potential: 6.5, makikaeshi: 7, marginSeconds: -0.3 }, 5)),
      horse(2, '弱', repeat({ firstCornerPosition: 15, finishPosition: 16, t2fSeconds: 27, l4fSeconds: 53, last3fSeconds: 39.5, pfsPast: 10, potential: 1, makikaeshi: 0, marginSeconds: 6 }, 5)),
      horse(3, '平均', repeat({}, 5)),
    ],
  };
  const rr = computeForecastV2(bigGap, neutralCourseAdjustment(), withRandom);
  const rBy = new Map(rr.explanations.map((e) => [e.horseNumber, e]));
  check('乱数有効でも強 > 弱', rBy.get(1)!.totalScore > rBy.get(2)!.totalScore);
  check('乱数の寄与が上限内', rr.explanations.every((e) => Math.abs(e.randomContribution) <= 0.02 + 1e-9));
  check('乱数有効でも決定論的',
    JSON.stringify(computeForecastV2(bigGap, neutralCourseAdjustment(), withRandom).explanations) === JSON.stringify(rr.explanations));
}

// ============================================================
section('欠損・異常データへの耐性');
// ============================================================
{
  const race: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      horse(1, '全欠損', []),
      // 異常値だけを持つ馬（T2F負値・L4F 110秒・上がり13秒）
      horse(2, '異常値', repeat({
        t2fSeconds: -13.6, l4fSeconds: 110.7, last3fSeconds: 13.2,
        firstCornerPosition: null, lastCornerPosition: null, finishPosition: null, abnormalFinish: true,
        pci: 2.8, marginSeconds: null, pfsPast: null, potential: null, makikaeshi: null,
      }, 3)),
      horse(3, '正常', repeat({}, 5)),
      // 中止のみ
      horse(4, '中止のみ', repeat({ abnormalFinish: true, finishPosition: null }, 3)),
    ],
  };
  const r = computeForecastV2(race);
  const all = r.explanations;
  check('NaN を返さない', all.every((e) =>
    Number.isFinite(e.totalScore) && Number.isFinite(e.earlyScore) &&
    Number.isFinite(e.midScore) && Number.isFinite(e.lateScore) &&
    Number.isFinite(e.totalReliability) && Number.isFinite(e.fadeRisk)));
  check('全スコアが [0,1]', all.every((e) => e.totalScore >= 0 && e.totalScore <= 1));
  const by = new Map(all.map((e) => [e.horseNumber, e]));
  check('異常値だけの馬が1着予想にならない', by.get(2)!.predictedFinishRank > 1, `rank=${by.get(2)!.predictedFinishRank}`);
  check('異常値だけの馬は低信頼度', by.get(2)!.totalReliability < 0.35, by.get(2)!.totalReliability.toFixed(3));
  check('中止のみの馬も neutral 付近', Math.abs(by.get(4)!.totalScore - 0.5) < 0.15, by.get(4)!.totalScore.toFixed(3));

  // 1頭立て
  const single = computeForecastV2({ condition: { ...CONDITION, fieldSize: 1 }, horses: [horse(1, '単走', repeat({}, 5))] });
  check('1頭立てでも落ちない', single.explanations.length === 1 && Number.isFinite(single.explanations[0].totalScore));
  // 0頭
  const empty = computeForecastV2({ condition: { ...CONDITION, fieldSize: 0 }, horses: [] });
  check('0頭でも落ちない', empty.explanations.length === 0);
}

// ============================================================
section('explainability 出力');
// ============================================================
{
  const race: ForecastRaceInputV2 = {
    condition: CONDITION,
    horses: [
      horse(7, 'ハイペース先行型', repeat({
        firstCornerPosition: 2, lastCornerPosition: 2, finishPosition: 2, fieldSize: 16,
        pci: 44, t2fSeconds: 22.8, l4fSeconds: 46.5, last3fSeconds: 34.2,
        pfsPast: 68, potential: 5.5, makikaeshi: 4.0, marginSeconds: 0.2,
      }, 5)),
      horse(3, '平均', repeat({}, 5)),
      horse(11, '追込', repeat({
        firstCornerPosition: 14, finishPosition: 4, last3fSeconds: 33.4, l4fSeconds: 45.5, makikaeshi: 8,
      }, 5)),
    ],
  };
  const r = computeForecastV2(race);
  const top = r.explanations[0];
  check('factors が寄与の大きい順', top.factors.every((f, i, arr) =>
    i === 0 || Math.abs(arr[i - 1].contribution) >= Math.abs(f.contribution)));
  check('factors に provenance がある', top.factors.every((f) => typeof f.provenance === 'string' && f.provenance.length > 0));
  check('early/mid/late の全 factor が含まれる',
    new Set(top.factors.map((f) => f.phase)).size === 3);
  check('欠損 factor は理由付き provenance', r.explanations.some((e) => e.factors.some((f) => f.provenance.includes('('))));
  check('expectedFormationRank が 1..n', r.explanations.every((e) => e.expectedFormationRank >= 1 && e.expectedFormationRank <= 3));

  const table = formatExplanationTable(r.explanations);
  check('表が生成される', table.includes('総合') && table.split('\n').length > 4);
  check('表に馬番が出る', table.includes('7') && table.includes('11'));

  console.log('\n[explainability 出力例]');
  console.log(table);
}

// ============================================================
console.log('\n' + '='.repeat(60));
console.log(` phase-models: pass=${pass} fail=${fail}`);
console.log('='.repeat(60));
if (fail > 0) process.exit(1);
