// types/csv.ts

/**
 * CSV の 1 行を “そのまま文字列” で表す型。
 * 列は必要に応じて増やしてください。
 */
export interface CsvRaceRow {
    /** 日付 (例: "2024.04.27") */
    '日付(yyyy.mm.dd)': string;
  
    /** 距離と馬場 (例: "芝1600" or "ダ1800") */
    距離: string;
  
    /** 走破タイム (例: "1:33.4") */
    走破タイム: string;
  
    /** 着差 (例: "0.4") */
    着差: string;
  
    PCI: string;
    着順: string;
  
    // --- 必要なら以下を追加 ---
    頭数: string;
    馬番: string;
    クラス名: string;
    騎手: string;
  }