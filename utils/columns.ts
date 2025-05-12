// utils/columns.ts
/* ============================================
   CSV の列 → 内部キー 対応表
   ============================================ */

/**
 * ① 出馬表 CSV（ヘッダー付き）用
 *    - キーは実際の列名（全角スペースは除去済）
 *    - 値はアプリ内部で使う論理キー
 */
export const RACE_HEADER2KEY: Record<string, string> = {
    '日付(yyyy.mm.dd)': 'date',
    '場所':              'place',
    '場所_1':            'placeSub',
    '距離':              'distance',
    'PCI':               'pci',
    '走破タイム':        'time',
    '着順':              'finish',
    '着差':              'margin',
    'クラス名':          'className',
    'レース印３':        'rating3',
    // 必要に応じて追加
  };
  
  /**
   * ② 枠順確定 CSV（ヘッダー無し）用
   *    - キーは列番号（0-based）
   */
  export const FRAME_INDEX2KEY: Record<number, string> = {
     0: 'date',        // 日付 yymmdd
     1: 'place',       // 開催地
     2: 'raceNo',      // R 番号
     3: 'className',   // クラス
     5: 'frameNo',     // 枠番
     6: 'horseNo',     // 馬番
     7: 'impost',      // 斤量
     8: 'horseName',   // 馬名
    12: 'jockey',      // 騎手
    14: 'surface',     // 馬場
    15: 'distance',    // 距離
    17: 'country',     // 所属
    18: 'trainer',     // 調教師
  };