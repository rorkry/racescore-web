// types/domain.ts
export interface Race {
    date: Date;                  // 日付オブジェクト
    surface: '芝' | 'ダ';        // 馬場
    distance: number;            // 距離 (m)
    timeSec: number;             // 走破タイム (秒)
    margin: number;              // 着差 (秒)
    pci: number;                 // PCI 値
    position: number;            // 着順
  
    // 必要なら以下も追加
    runners?: number;            // 出走頭数
    horseNo?: number;            // 馬番
    className?: string;          // レースクラス
    jockey?: string;             // 騎手名
  }