/**
 * forecast-layout-to-3d（旧2D展開予想図 → 3D 座標アダプタ）
 *
 * 2D の相対関係（前後順位・内外）を壊さず、3D の course distance / lateral へ変換する。
 * 旧2Dロジック自体は変更しない（読み取り → 変換のみ）。
 *
 * 正本:
 *  - スタート後: expectedPosition2C（または start phase の position）昇順 = 先頭が小さい
 *  - ゴール前: expectedPositionGoal（または finalStandings の position）
 *  - 内外: waku（小さい = 内）
 *
 * identity は常に horseNumber で保持（配列 index 禁止）。
 */

export interface ForecastHorseLayout {
  horseNumber: number;
  /** 2D 隊列位置（小さいほど先頭）。スタート後=expectedPosition2C、ゴール前=expectedPositionGoal */
  forecastPosition: number;
  /** 枠番 1..8 */
  waku: number;
}

export interface CourseLayout3D {
  /** フェーズ基準距離(m)。スタート後なら start endDistance、ゴール前なら raceDistance 付近 */
  anchorDistance: number;
  /** 1馬身あたりの前後差(m) */
  lengthsPerHorse?: number;
  /** 走路半幅(m)。lateral のクランプに使う */
  halfTrackWidth?: number;
  /** 枠→横位置のスケール(m/枠)。start-phase と同じ (waku-4.5)*scale */
  wakuLateralScale?: number;
}

export interface Layout3DPose {
  horseNumber: number;
  /** 走破距離(m) */
  currentDistance: number;
  /** 横位置(m)。負=内寄り（JRA慣習に合わせ start-phase と同式） */
  lateralPosition: number;
  /** 前後順位 1=先頭（forecastPosition 昇順） */
  rank: number;
  /** 先頭からの差(m) */
  distanceFromLeader: number;
}

const DEFAULT_LENGTH = 2.5;
const DEFAULT_WAKU_SCALE = 2.5;

/**
 * 2D 隊列を 3D の距離・横位置へ変換する。
 * 前後順は forecastPosition 昇順、同値なら waku 昇順（内優先）で安定化。
 */
export function convertForecastLayoutTo3D(
  horses: ForecastHorseLayout[],
  course: CourseLayout3D,
): Layout3DPose[] {
  const length = course.lengthsPerHorse ?? DEFAULT_LENGTH;
  const wakuScale = course.wakuLateralScale ?? DEFAULT_WAKU_SCALE;
  const half = course.halfTrackWidth ?? 12;
  const anchor = course.anchorDistance;

  const sorted = [...horses].sort((a, b) => {
    if (a.forecastPosition !== b.forecastPosition) return a.forecastPosition - b.forecastPosition;
    if (a.waku !== b.waku) return a.waku - b.waku;
    return a.horseNumber - b.horseNumber;
  });

  const poses: Layout3DPose[] = sorted.map((h, idx) => {
    const rank = idx + 1;
    const currentDistance = Math.max(0, anchor - (rank - 1) * length);
    const waku = Math.max(1, Math.min(8, h.waku || 1));
    let lateral = (waku - 4.5) * wakuScale;
    lateral = Math.max(-half, Math.min(half, lateral));
    return {
      horseNumber: h.horseNumber,
      currentDistance,
      lateralPosition: lateral,
      rank,
      distanceFromLeader: (rank - 1) * length,
    };
  });

  return poses;
}

/**
 * 2つの配置の前後順が horseNumber 単位で一致するか（テスト用）。
 * 戻り値: 不一致の horseNumber 一覧。
 */
export function diffRankOrder(
  a: Array<{ horseNumber: number; rank: number }>,
  b: Array<{ horseNumber: number; rank: number }>,
): number[] {
  const mapB = new Map(b.map((x) => [x.horseNumber, x.rank]));
  const mismatches: number[] = [];
  for (const x of a) {
    const br = mapB.get(x.horseNumber);
    if (br == null || br !== x.rank) mismatches.push(x.horseNumber);
  }
  return mismatches;
}

/**
 * 内外順（lateral 昇順 = 内→外）の horseNumber 列を返す。
 */
export function orderByLateralInnerFirst(
  poses: Array<{ horseNumber: number; lateralPosition: number }>,
): number[] {
  return [...poses]
    .sort((a, b) => {
      if (a.lateralPosition !== b.lateralPosition) return a.lateralPosition - b.lateralPosition;
      return a.horseNumber - b.horseNumber;
    })
    .map((p) => p.horseNumber);
}
