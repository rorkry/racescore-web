/** 単勝・複勝オッズ 1 行分 */
export interface OddsRow {
    /** 例: 202505040511 = YYYYMMDD + 場所 + レースNo */
    raceKey?: string;   // raceKey は API 取得時に付与するため任意
    /** 馬番 (半角) */
    horseNo: string;
    /** 単勝オッズ (例: 4.3) */
    win: number;
    /** 複勝オッズ最小値 (例: 1.8) */
    placeMin: number;
    /** 複勝オッズ最大値 (例: 2.3) */
    placeMax: number;
  }