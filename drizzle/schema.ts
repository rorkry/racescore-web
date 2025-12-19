import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * umadataテーブル
 * umadata.csvの50カラムをそのまま保存
 */
export const umadata = sqliteTable('umadata', {
  // 主キー
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // CSVの50カラム（すべてtext型で保存、必要に応じてフロントエンドで型変換）
  レースID新馬番無: text('race_id_new_no_horse_num'),
  日付: text('date'),
  距離: text('distance'),
  馬番: text('horse_number'),
  馬名: text('horse_name'),
  指数: text('index_value'),
  クラス名: text('class_name'),
  馬場状態: text('track_condition'),
  着順: text('finish_position'),
  上り3F: text('last_3f'),
  走破タイム: text('finish_time'),
  基準タイム: text('standard_time'),
  RPCI: text('rpci'),
  PCI: text('pci'),
  好走: text('good_run'),
  PCI3: text('pci3'),
  馬印: text('horse_mark'),
  角2: text('corner_2'),
  角3: text('corner_3'),
  角4: text('corner_4'),
  性別: text('gender'),
  年齢: text('age'),
  馬体重: text('horse_weight'),
  馬体重増減: text('weight_change'),
  斤量: text('jockey_weight'),
  騎手: text('jockey'),
  多頭出し: text('multiple_entries'),
  所属: text('affiliation'),
  調教師: text('trainer'),
  場所: text('place'),
  頭数: text('number_of_horses'),
  人気: text('popularity'),
  種牡馬: text('sire'),
  母馬: text('dam'),
  馬場状態2: text('track_condition_2'),
  場所2: text('place_2'),
  着差: text('margin'),
  角1: text('corner_1'),
  角2_2: text('corner_2_2'),
  角3_2: text('corner_3_2'),
  角4_2: text('corner_4_2'),
  ワーク1S: text('work_1s'),
  馬印2: text('horse_mark_2'),
  馬印3: text('horse_mark_3'),
  馬印4: text('horse_mark_4'),
  馬印5: text('horse_mark_5'),
  馬印6: text('horse_mark_6'),
  馬印7: text('horse_mark_7'),
  馬印7_2: text('horse_mark_7_2'),
  馬印8: text('horse_mark_8'),
  
  // タイムスタンプ
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export type Umadata = typeof umadata.$inferSelect;
export type NewUmadata = typeof umadata.$inferInsert;

/**
 * racesテーブル（既存）
 * レースデータを保存
 */
export const races = sqliteTable('races', {
  raceKey: text('raceKey').primaryKey(),
  date: text('date'),
  place: text('place'),
  raceNo: integer('raceNo'),
  data: text('data'),
});

export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;

/**
 * umarenテーブル（既存）
 * 馬連オッズデータを保存
 */
export const umaren = sqliteTable('umaren', {
  raceKey: text('raceKey').notNull(),
  comb: text('comb').notNull(),
  odds: integer('odds'),
}, (table) => ({
  pk: { columns: [table.raceKey, table.comb] },
}));

export type Umaren = typeof umaren.$inferSelect;
export type NewUmaren = typeof umaren.$inferInsert;

/**
 * wideテーブル（既存）
 * ワイドオッズデータを保存
 */
export const wide = sqliteTable('wide', {
  raceKey: text('raceKey').notNull(),
  comb: text('comb').notNull(),
  odds: integer('odds'),
}, (table) => ({
  pk: { columns: [table.raceKey, table.comb] },
}));

export type Wide = typeof wide.$inferSelect;
export type NewWide = typeof wide.$inferInsert;
