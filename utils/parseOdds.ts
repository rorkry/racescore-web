import Papa from 'papaparse';
import type { OddsRow } from '@/types/odds';

/**
 * JRA オッズ CSV → OddsRow[] へ変換
 * @param file アップロードされた CSV ファイル
 */
export const parseOdds = (file: File): Promise<OddsRow[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<OddsRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: (error) => reject(error),
    });
  });
};