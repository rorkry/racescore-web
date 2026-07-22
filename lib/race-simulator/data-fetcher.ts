/**
 * レースシミュレーター用データ取得
 * 
 * 既存の race-pace-predictor.ts から独立したデータ層
 */

export interface HorseIndices {
  horseNumber: number;
  horseName: string;
  
  // 基本指数（indicesテーブルから）
  T2F: number | null;          // 前半2Fラップ（秒）
  L4F: number | null;          // 後半4F指数
  potential: number | null;    // ポテンシャル指数
  makikaeshi: number | null;   // 巻き返し指数
  PFS: number | null;          // 先行期待度（過去）※indicesから取得
  revouma: number | null;      // レボウマ指数
  cushion: number | null;      // クッション値
  
  // 過去実績（umadataから）
  pastPositions: {
    corner1: number[];         // 過去の1コーナー通過順
    corner2: number[];         // 過去の2コーナー通過順
    corner3: number[];         // 過去の3コーナー通過順
    corner4: number[];         // 過去の4コーナー通過順
  };
  
  // 前走データ
  lastRace: {
    T2F: number | null;
    corner1: number | null;
    corner2: number | null;
    distance: number | null;
    surface: string | null;
  };
  
  // 平均データ（距離±200m、同馬場）
  avgData: {
    T2F: number | null;
    L4F: number | null;
    potential: number | null;
    makikaeshi: number | null;
    PFS: number | null;
    raceCount: number;
  };
}

/**
 * indicesテーブルから全指数を取得
 */
export async function fetchHorseIndices(
  db: any,
  horseName: string,
  targetDistance: number,
  targetSurface: string,
  currentRaceDateNum: number
): Promise<HorseIndices> {
  const horseNumber = 0; // 後で設定
  
  // umadataから過去レースを取得
  const raceQuery = `
    SELECT race_id, umaban, corner_1, corner_2, corner_3, corner_4, date, distance
    FROM umadata
    WHERE horse_name = $1
    ORDER BY race_id DESC
  `;
  
  const allRaces = await db.prepare(raceQuery).all(horseName) as Array<{
    race_id: string;
    umaban: string;
    corner_1: string;
    corner_2: string;
    corner_3: string;
    corner_4: string;
    date: string;
    distance: string;
  }>;
  
  // 現在のレース日付以前のデータのみ
  const pastRaces = allRaces.filter(r => parseDateToNumber(r.date) < currentRaceDateNum);
  
  if (pastRaces.length === 0) {
    return createEmptyIndices(horseNumber, horseName);
  }
  
  // 過去通過順位を抽出
  const pastPositions = {
    corner1: pastRaces.map(r => parseInt(r.corner_1, 10)).filter(n => !isNaN(n)),
    corner2: pastRaces.map(r => parseInt(r.corner_2, 10)).filter(n => !isNaN(n)),
    corner3: pastRaces.map(r => parseInt(r.corner_3, 10)).filter(n => !isNaN(n)),
    corner4: pastRaces.map(r => parseInt(r.corner_4, 10)).filter(n => !isNaN(n)),
  };
  
  // 前走データ
  const lastRace = pastRaces[0];
  const lastRaceId = lastRace.race_id + lastRace.umaban.padStart(2, '0');
  
  const lastIndexQuery = `
    SELECT "T2F", "L4F", potential, makikaeshi, "PFS", revouma, cushion
    FROM indices
    WHERE race_id = $1
  `;
  
  const lastIndexData = await db.prepare(lastIndexQuery).get(lastRaceId) as {
    T2F: number;
    L4F: number;
    potential: number;
    makikaeshi: number;
    PFS: number;
    revouma: number;
    cushion: number;
  } | undefined;
  
  const lastDistMatch = lastRace.distance?.match(/(\d+)/);
  const lastDistance = lastDistMatch ? parseInt(lastDistMatch[1], 10) : null;
  const lastSurface = lastRace.distance?.includes('芝') ? '芝' : 'ダ';
  
  // 距離±200m、同馬場のレースで平均を計算
  const relevantRaces = pastRaces.filter(r => {
    const distMatch = r.distance?.match(/(\d+)/);
    const raceDist = distMatch ? parseInt(distMatch[1], 10) : 0;
    const isTurf = r.distance?.includes('芝');
    
    return Math.abs(raceDist - targetDistance) <= 200 &&
           ((targetSurface === '芝' && isTurf) || (targetSurface !== '芝' && !isTurf));
  });
  
  const indicesData: Array<{
    T2F: number;
    L4F: number;
    potential: number;
    makikaeshi: number;
    PFS: number;
    revouma: number;
    cushion: number;
  }> = [];
  
  for (const race of relevantRaces) {
    const raceId = race.race_id + race.umaban.padStart(2, '0');
    const indexQuery = `
      SELECT "T2F", "L4F", potential, makikaeshi, "PFS", revouma, cushion
      FROM indices
      WHERE race_id = $1
    `;
    
    const indexRecord = await db.prepare(indexQuery).get(raceId) as typeof indicesData[0] | undefined;
    
    if (indexRecord) {
      indicesData.push(indexRecord);
    }
  }
  
  // 平均計算
  const avgData = {
    T2F: average(indicesData.map(d => d.T2F).filter(v => v !== null && v > 0)),
    L4F: average(indicesData.map(d => d.L4F).filter(v => v !== null && v > 0)),
    potential: average(indicesData.map(d => d.potential).filter(v => v !== null)),
    makikaeshi: average(indicesData.map(d => d.makikaeshi).filter(v => v !== null)),
    PFS: average(indicesData.map(d => d.PFS).filter(v => v !== null)),
    raceCount: indicesData.length,
  };
  
  return {
    horseNumber,
    horseName,
    T2F: lastIndexData?.T2F || null,
    L4F: lastIndexData?.L4F || null,
    potential: lastIndexData?.potential || null,
    makikaeshi: lastIndexData?.makikaeshi || null,
    PFS: lastIndexData?.PFS || null,
    revouma: lastIndexData?.revouma || null,
    cushion: lastIndexData?.cushion || null,
    pastPositions,
    lastRace: {
      T2F: lastIndexData?.T2F || null,
      corner1: parseInt(lastRace.corner_1, 10) || null,
      corner2: parseInt(lastRace.corner_2, 10) || null,
      distance: lastDistance,
      surface: lastSurface,
    },
    avgData,
  };
}

/**
 * 空のインデックスデータを生成
 */
function createEmptyIndices(horseNumber: number, horseName: string): HorseIndices {
  return {
    horseNumber,
    horseName,
    T2F: null,
    L4F: null,
    potential: null,
    makikaeshi: null,
    PFS: null,
    revouma: null,
    cushion: null,
    pastPositions: {
      corner1: [],
      corner2: [],
      corner3: [],
      corner4: [],
    },
    lastRace: {
      T2F: null,
      corner1: null,
      corner2: null,
      distance: null,
      surface: null,
    },
    avgData: {
      T2F: null,
      L4F: null,
      potential: null,
      makikaeshi: null,
      PFS: null,
      raceCount: 0,
    },
  };
}

/**
 * 配列の平均を計算
 */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 日付文字列をYYYYMMDD形式の数値に変換
 */
function parseDateToNumber(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 0;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  return year * 10000 + month * 100 + day;
}

/**
 * 過去通過順パターンを文字列で返す
 * 例: "1-1-2-3" （1C-2C-3C-4C）
 */
export function getPastPositionPattern(
  pastPositions: HorseIndices['pastPositions'],
  raceIndex: number = 0
): string {
  const patterns: string[] = [];
  
  if (pastPositions.corner1[raceIndex]) patterns.push(String(pastPositions.corner1[raceIndex]));
  if (pastPositions.corner2[raceIndex]) patterns.push(String(pastPositions.corner2[raceIndex]));
  if (pastPositions.corner3[raceIndex]) patterns.push(String(pastPositions.corner3[raceIndex]));
  if (pastPositions.corner4[raceIndex]) patterns.push(String(pastPositions.corner4[raceIndex]));
  
  return patterns.length > 0 ? patterns.join('-') : 'N/A';
}

/**
 * 先行意欲スコアを計算
 * PFS指数 + 過去1C通過順位の傾向
 */
export function calculateLeadingIntention(indices: HorseIndices): number {
  let score = 50; // デフォルト
  
  // PFS指数がある場合、それを基準に（0-100スケール）
  if (indices.PFS !== null) {
    score = indices.PFS;
  }
  
  // 過去1C通過順位で補正
  const corner1Positions = indices.pastPositions.corner1;
  if (corner1Positions.length > 0) {
    const frontCount = corner1Positions.filter(pos => pos <= 3).length;
    const frontRatio = frontCount / corner1Positions.length;
    
    // 前にいた割合が高いほど先行意欲が高い
    const corner1Boost = frontRatio * 30; // 最大+30
    score = score * 0.7 + corner1Boost;
  }
  
  return Math.max(0, Math.min(100, score));
}
