import { z } from 'zod';
import { router, publicProcedure } from './trpc';
import { getRawDb } from '../lib/db';

// CSVの1行分のデータ型（50カラム）
const UmadataRowSchema = z.object({
  レースID新馬番無: z.string().optional(),
  日付: z.string().optional(),
  距離: z.string().optional(),
  馬番: z.string().optional(),
  馬名: z.string().optional(),
  指数: z.string().optional(),
  クラス名: z.string().optional(),
  馬場状態: z.string().optional(),
  着順: z.string().optional(),
  上り3F: z.string().optional(),
  走破タイム: z.string().optional(),
  基準タイム: z.string().optional(),
  RPCI: z.string().optional(),
  PCI: z.string().optional(),
  好走: z.string().optional(),
  PCI3: z.string().optional(),
  馬印: z.string().optional(),
  角2: z.string().optional(),
  角3: z.string().optional(),
  角4: z.string().optional(),
  性別: z.string().optional(),
  年齢: z.string().optional(),
  馬体重: z.string().optional(),
  馬体重増減: z.string().optional(),
  斤量: z.string().optional(),
  騎手: z.string().optional(),
  多頭出し: z.string().optional(),
  所属: z.string().optional(),
  調教師: z.string().optional(),
  場所: z.string().optional(),
  頭数: z.string().optional(),
  人気: z.string().optional(),
  種牡馬: z.string().optional(),
  母馬: z.string().optional(),
  馬場状態2: z.string().optional(),
  場所2: z.string().optional(),
  着差: z.string().optional(),
  角1: z.string().optional(),
  角2_2: z.string().optional(),
  角3_2: z.string().optional(),
  角4_2: z.string().optional(),
  ワーク1S: z.string().optional(),
  馬印2: z.string().optional(),
  馬印3: z.string().optional(),
  馬印4: z.string().optional(),
  馬印5: z.string().optional(),
  馬印6: z.string().optional(),
  馬印7: z.string().optional(),
  馬印7_2: z.string().optional(),
  馬印8: z.string().optional(),
});

export const appRouter = router({
  /**
   * CSVデータをアップロードしてumadataテーブルに保存
   */
  uploadCSV: publicProcedure
    .input(z.object({
      data: z.array(UmadataRowSchema),
      raceId: z.string().optional(), // レースIDで既存データを削除する場合
    }))
    .mutation(async ({ input }) => {
      const db = getRawDb();
      
      // 既存データを削除（レースIDが指定されている場合）
      if (input.raceId) {
        await db.prepare('DELETE FROM umadata WHERE race_id = ?').run(input.raceId);
      }
      
      // PostgreSQL用：各行を個別にINSERT（transactionはSQLite専用のため）
      for (const row of input.data) {
        await db.prepare(`
          INSERT INTO umadata (
            race_id, date, distance, horse_number, horse_name, 
            index_value, class_name, track_condition, finish_position, last_3f,
            finish_time, standard_time, rpci, pci, good_run, pci3, horse_mark, 
            corner_2, corner_3, corner_4, gender, age, horse_weight, weight_change, 
            jockey_weight, jockey, multiple_entries, affiliation, trainer, place,
            number_of_horses, popularity, sire, dam, track_condition_2, place_2, 
            margin, corner_1, corner_2_2, corner_3_2, corner_4_2, work_1s, 
            horse_mark_2, horse_mark_3, horse_mark_4, horse_mark_5, horse_mark_6, 
            horse_mark_7, horse_mark_7_2, horse_mark_8
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `).run(
          row.レースID新馬番無 || null,
          row.日付 || null,
          row.距離 || null,
          row.馬番 || null,
          row.馬名 || null,
          row.指数 || null,
          row.クラス名 || null,
          row.馬場状態 || null,
          row.着順 || null,
          row.上り3F || null,
          row.走破タイム || null,
          row.基準タイム || null,
          row.RPCI || null,
          row.PCI || null,
          row.好走 || null,
          row.PCI3 || null,
          row.馬印 || null,
          row.角2 || null,
          row.角3 || null,
          row.角4 || null,
          row.性別 || null,
          row.年齢 || null,
          row.馬体重 || null,
          row.馬体重増減 || null,
          row.斤量 || null,
          row.騎手 || null,
          row.多頭出し || null,
          row.所属 || null,
          row.調教師 || null,
          row.場所 || null,
          row.頭数 || null,
          row.人気 || null,
          row.種牡馬 || null,
          row.母馬 || null,
          row.馬場状態2 || null,
          row.場所2 || null,
          row.着差 || null,
          row.角1 || null,
          row.角2_2 || null,
          row.角3_2 || null,
          row.角4_2 || null,
          row.ワーク1S || null,
          row.馬印2 || null,
          row.馬印3 || null,
          row.馬印4 || null,
          row.馬印5 || null,
          row.馬印6 || null,
          row.馬印7 || null,
          row.馬印7_2 || null,
          row.馬印8 || null
        );
      }
      
      return {
        success: true,
        count: input.data.length,
      };
    }),

  /**
   * レースIDを指定してデータを取得
   */
  getRaceData: publicProcedure
    .input(z.object({
      raceId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getRawDb();
      
      if (input.raceId) {
        // レースIDで絞り込み
        const result = await db.prepare('SELECT * FROM umadata WHERE race_id = ?').all(input.raceId);
        return result;
      } else {
        // 全データを取得（非推奨：データ量が多い場合は使用しない）
        const result = await db.prepare('SELECT * FROM umadata LIMIT 100').all();
        return result;
      }
    }),

  /**
   * 全データを取得（制限付き）
   */
  getAllData: publicProcedure
    .query(async () => {
      const db = getRawDb();
      const result = await db.prepare('SELECT * FROM umadata LIMIT 100').all();
      return result;
    }),
    
  /**
   * ユニークなレースIDのリストを取得
   */
  getRaceIds: publicProcedure
    .query(async () => {
      const db = getRawDb();
      const result = await db.prepare('SELECT DISTINCT race_id FROM umadata ORDER BY race_id DESC LIMIT 100').all();
      return result;
    }),
});

export type AppRouter = typeof appRouter;
