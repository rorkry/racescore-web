import { toSec } from './time';
import { RACE_HEADER2KEY } from './columns';
import type { CsvRaceRow } from '@/types/csv';
import type { Race } from '@/types/domain';

/**
 * ヘッダー付き CSV 1 行 → 内部用 Race オブジェクト
 *
 * - ヘッダー名は `RACE_HEADER2KEY` で論理キーへ変換
 * - 数値/日付などの軽い型変換をここで行う
 */
export function rowToRace(raw: CsvRaceRow): Race {
  const r: any = {};

  // 1. ヘッダー → 論理キー変換
  Object.entries(RACE_HEADER2KEY).forEach(([csvKey, logicalKey]) => {
    r[logicalKey] = ((raw as any)[csvKey] ?? '').toString().trim();
  });

  // 2. 追加の型変換・加工 ------------------------
  // 距離: "芝1600" → 1600
  if (typeof r.distance === 'string') {
    const m = r.distance.match(/(\d+)/);
    r.distance = m ? Number(m[1]) : undefined;
  }

  // 走破タイム: "1:34.3" → 秒数
  if (raw['走破タイム']) {
    r.timeSec = toSec(raw['走破タイム']);
  }

  // 日付(yyyy.mm.dd) を YYYYMMDD 数値へ
  if (raw['日付(yyyy.mm.dd)']) {
    r.dateNum = Number(raw['日付(yyyy.mm.dd)'].replace(/\D/g, ''));
  }

  return r as Race;
}