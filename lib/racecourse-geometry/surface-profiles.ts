/**
 * racecourse-geometry / surface-profiles
 *
 * 「芝スタートのダートコース」を表現するための路面区間（surface segment）データと解決関数。
 *
 * 【重要な設計前提（近似表示）】
 *  - 現在の RacecourseGeometry には実際の芝ポケット（張り出し部）の形状が存在しない。
 *  - よって本モジュールは「ポケット形状の再現」ではなく、
 *    「現在の走行 path 上で、発走から一定距離を芝スタート区間として視覚的に示す近似」である。
 *  - raceProgress / 馬の走行 path / 速度 / finish 判定 は一切変更しない（表示判定専用）。
 *  - estimated データは確定値として扱わない（provenance で識別）。
 *  - 将来、正確な資料が得られたら PROFILES の数値のみ差し替えれば足りる構造にしてある。
 *
 * データ粒度: geometry.id（venue:surface:route）× raceDistance。startMarkers と同じ距離キー粒度。
 * レース発走地点からの相対距離（fromRaceProgress/toRaceProgress, 単位 m, start=0）で定義する。
 */

import type { RacecourseGeometry } from './types';

export type SurfaceType = 'turf' | 'dirt';

/** 路面区間データの出所（正直に持つ） */
export type SurfaceSegmentProvenance =
  | 'official' // JRA公式/JRA-VANに芝区間長の明記がある
  | 'documented-secondary' // 二次資料（コース解説等）に芝区間長の記載がある
  | 'estimated'; // 公式・二次資料に長さ明記がなく、コース図比率等からの概算

export interface SurfaceSegment {
  /** レース発走地点からの相対距離(m)。start=0 */
  fromRaceProgress: number;
  /** レース発走地点からの相対距離(m)。内ラチ側の区間終端として扱う */
  toRaceProgress: number;
  surface: SurfaceType;
  provenance: SurfaceSegmentProvenance;
  /** 採用根拠（必須） */
  sourceNote: string;
  /**
   * 東京ダ1600のように内外で芝区間長が異なる場合の「外ラチ側」区間終端(m)。
   * 省略時は内外同一（toRaceProgress を全幅で使用）。
   * lateralPosition に応じて toRaceProgress↔outerToRaceProgress を線形補間する。
   */
  outerToRaceProgress?: number;
}

/** 距離キー → 区間列。区間列は [0, raceDistance] を過不足なく覆う */
export type SurfaceProfileByDistance = Record<number, SurfaceSegment[]>;

/**
 * geometry.id → (raceDistance → segments)
 *
 * 対象は「芝スタートのダート」8コースのみ。ここに無い geometry/距離は
 * geometry.surface（既存の単一路面）へフォールバックする。
 */
const PROFILES: Record<string, SurfaceProfileByDistance> = {
  // ---- 比較的根拠が明確（official / documented-secondary） ----

  // 東京ダ1600: フェブラリーS舞台。2C奥ポケット発走。内約150m/外約180m芝（内外差あり）。
  'tokyo:dirt:main': {
    1600: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 150,
        outerToRaceProgress: 180,
        surface: 'turf',
        provenance: 'official',
        sourceNote:
          'JRA公式/JRA-VAN: 内枠約150m・外枠約180m芝を走ってダートへ。内外差を outerToRaceProgress で補間',
      },
      {
        fromRaceProgress: 150,
        toRaceProgress: 1600,
        surface: 'dirt',
        provenance: 'official',
        sourceNote: '芝区間後はダート（東京ダート本走路）',
      },
    ],
  },

  // 新潟ダ1200: 2C奥ポケット発走。芝約100m。
  'niigata:dirt:main': {
    1200: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 100,
        surface: 'turf',
        provenance: 'documented-secondary',
        sourceNote: '二次資料: 芝の部分を約100m通過してダートに入る',
      },
      {
        fromRaceProgress: 100,
        toRaceProgress: 1200,
        surface: 'dirt',
        provenance: 'documented-secondary',
        sourceNote: '芝区間後はダート',
      },
    ],
  },

  // 中京ダ1400: 2C奥ポケット発走。芝約150m（外側の方が長いが外側値は未数値化のため単一値）。
  'chukyo:dirt:main': {
    1400: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 150,
        surface: 'turf',
        provenance: 'documented-secondary',
        sourceNote:
          '二次資料: 約150mの芝スタート（外側の方が芝が長いとされるが外側値は未数値化のため単一値で近似）',
      },
      {
        fromRaceProgress: 150,
        toRaceProgress: 1400,
        surface: 'dirt',
        provenance: 'documented-secondary',
        sourceNote: '芝区間後はダート',
      },
    ],
  },

  // 阪神ダ2000: 芝内回り4C出口付近発走。芝約80m。
  'hanshin:dirt:main': {
    2000: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 80,
        surface: 'turf',
        provenance: 'documented-secondary',
        sourceNote: '二次資料: 芝内回り4コーナー出口付近発走。最初の芝部分は約80m',
      },
      {
        fromRaceProgress: 80,
        toRaceProgress: 2000,
        surface: 'dirt',
        provenance: 'documented-secondary',
        sourceNote: '芝区間後はダート',
      },
    ],
    // 阪神ダ1400: 2C奥ポケット発走。芝区間長は公式・二次資料に明記なし → 推定。
    1400: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 110,
        surface: 'turf',
        provenance: 'estimated',
        sourceNote:
          '推定: 芝スタートだが芝区間長の明記なし。他場ポケット長(80〜180m)を踏まえコース図比率から概算(±50m)。正確な公式値が得られ次第、数値のみ差し替え',
      },
      {
        fromRaceProgress: 110,
        toRaceProgress: 1400,
        surface: 'dirt',
        provenance: 'estimated',
        sourceNote: '芝区間後はダート（芝区間長は推定）',
      },
    ],
  },

  // ---- 推定4コース（estimated。暫定値。数値のみ差し替え可能） ----

  // 福島ダ1150: 2Cポケット発走。芝区間長の明記なし → 推定。
  'fukushima:dirt:main': {
    1150: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 100,
        surface: 'turf',
        provenance: 'estimated',
        sourceNote:
          '推定: 2Cポケット芝スタートだが芝区間長の明記なし。コース図比率からの概算(±50m)。要公式値差し替え',
      },
      {
        fromRaceProgress: 100,
        toRaceProgress: 1150,
        surface: 'dirt',
        provenance: 'estimated',
        sourceNote: '芝区間後はダート（芝区間長は推定）',
      },
    ],
  },

  // 中山ダ1200: 2C奥ポケット発走。芝区間長の明記なし → 推定。
  'nakayama:dirt:main': {
    1200: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 130,
        surface: 'turf',
        provenance: 'estimated',
        sourceNote:
          '推定: 2C奥ポケット芝スタートだが芝区間長の明記なし。コース図比率からの概算(±50m)。要公式値差し替え',
      },
      {
        fromRaceProgress: 130,
        toRaceProgress: 1200,
        surface: 'dirt',
        provenance: 'estimated',
        sourceNote: '芝区間後はダート（芝区間長は推定）',
      },
    ],
  },

  // 京都ダ1400: 2C奥ポケット発走。芝区間長の明記なし → 推定。
  'kyoto:dirt:main': {
    1400: [
      {
        fromRaceProgress: 0,
        toRaceProgress: 100,
        surface: 'turf',
        provenance: 'estimated',
        sourceNote:
          '推定: 2C奥ポケット芝スタートだが芝区間長の明記なし。コース図比率からの概算(±50m)。要公式値差し替え',
      },
      {
        fromRaceProgress: 100,
        toRaceProgress: 1400,
        surface: 'dirt',
        provenance: 'estimated',
        sourceNote: '芝区間後はダート（芝区間長は推定）',
      },
    ],
  },
};

/** 指定 geometry.id + raceDistance の区間列を返す（無ければ null） */
export function getSurfaceProfile(
  geometryId: string,
  raceDistance: number
): SurfaceSegment[] | null {
  const byDistance = PROFILES[geometryId];
  if (!byDistance) return null;
  return byDistance[raceDistance] ?? null;
}

/** mixed-surface（芝スタート等）を持つレースか */
export function hasMixedSurface(geometryId: string, raceDistance: number): boolean {
  return getSurfaceProfile(geometryId, raceDistance) != null;
}

export interface ResolveSurfaceInput {
  geometry: RacecourseGeometry;
  raceDistance: number;
  /** レース発走からの相対走破距離(m)。負数/超過は安全にclamp */
  raceProgress: number;
  /**
   * 横位置(m)。+が外ラチ側、-が内ラチ側（normal 外向き契約）。
   * 東京ダ1600の内外差補間に使う。省略時は代表値（中央）扱い。
   */
  lateralPosition?: number;
}

export interface SurfaceResolution {
  surface: SurfaceType;
  /** mixed-surface profile が適用されたか（true=近似表示区間, false=既存の単一路面） */
  fromProfile: boolean;
  /** profile 由来のときのみ。近似の確度判断に使う */
  provenance?: SurfaceSegmentProvenance;
  /** 一致した区間（profile 由来のときのみ） */
  segment?: SurfaceSegment;
}

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * ある地点の路面を解決する（THREE非依存の純関数）。
 *
 * - profile 未登録 → geometry.surface（既存の単一路面, fromProfile=false）
 * - profile あり → 区間列から解決。芝→ダート境界直後はダート（[from, effTo) が芝）
 * - lateralPosition 指定時、outerToRaceProgress を持つ芝区間は内外を線形補間
 * - 負数/超過/NaN の raceProgress は [0, raceDistance] にclamp
 * - direction / playback speed / 馬配列順 に依存しない（raceProgress と lateral のみで決まる）
 */
export function resolveSurfaceAtRaceProgress(
  input: ResolveSurfaceInput
): SurfaceResolution {
  const { geometry, raceDistance } = input;
  const segments = getSurfaceProfile(geometry.id, raceDistance);
  if (!segments || segments.length === 0) {
    return { surface: geometry.surface, fromProfile: false };
  }

  const p = clampNum(input.raceProgress, 0, raceDistance);

  // 内外補間係数 0..1（0=内ラチ, 0.5=中央, 1=外ラチ）
  const half = Math.max(1, geometry.trackWidth / 2);
  const lat01 =
    input.lateralPosition == null || !Number.isFinite(input.lateralPosition)
      ? 0.5
      : (clampNum(input.lateralPosition, -half, half) + half) / (2 * half);

  const lastIndex = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const effTo =
      seg.outerToRaceProgress != null
        ? seg.toRaceProgress + (seg.outerToRaceProgress - seg.toRaceProgress) * lat01
        : seg.toRaceProgress;
    const inRange =
      i === lastIndex
        ? p >= seg.fromRaceProgress - 1e-9 && p <= effTo + 1e-9 // 最終区間は終端(=raceDistance)を含む
        : p >= seg.fromRaceProgress - 1e-9 && p < effTo - 1e-9; // 境界直後は次区間へ
    if (inRange) {
      return {
        surface: seg.surface,
        fromProfile: true,
        provenance: seg.provenance,
        segment: seg,
      };
    }
  }

  // 区間で覆えなかった場合（設計上到達しないはずだが安全側）: 最終区間 or 既定
  const fallback = segments[lastIndex];
  return {
    surface: fallback?.surface ?? geometry.surface,
    fromProfile: !!fallback,
    provenance: fallback?.provenance,
    segment: fallback,
  };
}
