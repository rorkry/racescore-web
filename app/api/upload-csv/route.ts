import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { auth } from '@/lib/auth';
import { checkRateLimit, getRateLimitIdentifier, strictRateLimit } from '@/lib/rate-limit';

// Vercel/Railway向けのタイムアウト設定
export const maxDuration = 300; // 5分
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 管理者認証チェック
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }
    
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // Rate Limiting
    const identifier = getRateLimitIdentifier(request);
    const rateLimit = checkRateLimit(`upload-csv:${identifier}`, strictRateLimit);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let text: string;
    try {
      text = iconv.decode(buffer, 'Shift_JIS');
    } catch {
      text = buffer.toString('utf-8');
    }
    
    const { data } = Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
    });

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'CSVデータが空です' }, { status: 400 });
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 30000, // 30秒
      idleTimeoutMillis: 60000, // 60秒
      max: 5, // 最大接続数
    });

    const client = await pool.connect();

    try {
      if (file.name.includes('wakujun')) {
        const result = await importWakujun(client, data);
        client.release();
        await pool.end();
        return NextResponse.json({ 
          success: true, 
          count: result.count, 
          table: 'wakujun',
          date: result.date,
          message: `${result.date}のデータを${result.isUpdate ? '更新' : '追加'}しました`
        });
      } else if (file.name.includes('umadata')) {
        const result = await importUmadata(client, data.slice(1)); // ヘッダー行をスキップ
        client.release();
        await pool.end();
        return NextResponse.json({ 
          success: true, 
          count: result.count, 
          table: 'umadata',
          inserted: result.inserted,
          message: `${result.inserted}件のデータを保存しました`
        });
      } else {
        client.release();
        await pool.end();
        return NextResponse.json({ error: 'ファイル名がwakujunまたはumadataを含む必要があります' }, { status: 400 });
      }
    } catch (error) {
      client.release();
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('CSV upload error:', error);
    return NextResponse.json({ 
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      name: error?.name
    }, { status: 500 });
  }
}

async function importWakujun(client: any, data: any[]): Promise<{ count: number; date: string; isUpdate: boolean }> {
  const firstRow = data[0];
  if (!Array.isArray(firstRow) || firstRow.length < 3) {
    throw new Error('CSVデータが不正です');
  }
  
  const date = (firstRow[0] || '').trim();
  const fullDateStr = (firstRow[2] || '').trim();
  
  let year: string | null = null;
  const yearMatch = fullDateStr.match(/^(\d{4})/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  const existingResult = await client.query(
    'SELECT COUNT(*) as count FROM wakujun WHERE date = $1 AND year = $2',
    [date, year]
  );
  const isUpdate = existingResult.rows[0].count > 0;

  await client.query('BEGIN');

  try {
    if (isUpdate) {
      await client.query('DELETE FROM wakujun WHERE date = $1 AND year = $2', [date, year]);
    }

    let count = 0;
    for (const row of data) {
      if (Array.isArray(row) && row.length >= 23) {
        try {
          const rowFullDate = (row[2] || '').trim();
          const rowYearMatch = rowFullDate.match(/^(\d{4})/);
          const rowYear = rowYearMatch ? rowYearMatch[1] : year;
          
          await client.query(`
            INSERT INTO wakujun (
              year, date, place, race_number, class_name_1, class_name_2,
              waku, umaban, kinryo, umamei, seibetsu, nenrei, nenrei_display,
              kishu, track_type, distance, tosu,
              shozoku, chokyoshi, shozoku_chi, umajirushi
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          `, [
            rowYear,
            (row[0] || '').trim(),
            (row[3] || '').trim(),
            (row[4] || '').trim(),
            (row[5] || '').trim(),
            (row[6] || '').trim(),
            (row[7] || '').trim(),
            (row[8] || '').trim(),
            (row[9] || '').trim(),
            (row[10] || '').trim(),
            (row[11] || '').trim(),
            (row[12] || '').trim(),
            (row[13] || '').trim(),
            (row[14] || '').trim(),
            (row[16] || '').trim(),
            (row[17] || '').trim(),
            (row[18] || '').trim(),
            (row[19] || '').trim(),
            (row[20] || '').trim(),
            (row[21] || '').trim(),
            (row[22] || '').trim()
          ]);
          count++;
        } catch (err: any) {
          console.error('Error inserting wakujun row:', err.message);
        }
      }
    }

    await client.query('COMMIT');
    return { count, date, isUpdate };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * 新umadataフォーマット（39列）
 * 0: race_id - レースID(馬番号あり)
 * 1: date - 日付
 * 2: place - 場所
 * 3: course_type - 内/外回り
 * 4: distance - 距離(芝2200等)
 * 5: class_name - クラス
 * 6: race_name - レース名
 * 7: gender_limit - 牝馬限定フラグ
 * 8: age_limit - 2歳/3歳限定
 * 9: waku - 枠
 * 10: umaban - 馬番
 * 11: horse_name - 馬名
 * 12: corner_4_position - 4角位置
 * 13: track_condition - 馬場状態
 * 14: field_size - 頭数
 * 15: popularity - 人気
 * 16: finish_position - 着順
 * 17: last_3f - 上がり3F
 * 18: weight_carried - 斤量
 * 19: horse_weight - 馬体重
 * 20: weight_change - 馬体重増減
 * 21: finish_time - 走破タイム
 * 22: race_count - 休み明けから何戦目
 * 23: margin - 着差
 * 24: win_odds - 単勝オッズ
 * 25: place_odds - 複勝オッズ
 * 26: win_payout - 単勝配当
 * 27: place_payout - 複勝配当
 * 28: rpci - RPCI
 * 29: pci - PCI
 * 30: pci3 - PCI3
 * 31: horse_mark - 印
 * 32: passing_order - 通過順
 * 33: gender_age - 性齢(牡3等)
 * 34: jockey - 騎手
 * 35: trainer - 調教師
 * 36: sire - 種牡馬
 * 37: dam - 母馬名
 * 38: lap_time - ラップタイム
 */
async function importUmadata(client: any, data: any[]): Promise<{ count: number; inserted: number }> {
  console.log(`[importUmadata] 開始: ${data.length}行`);
  const startTime = Date.now();

  let count = 0;
  let inserted = 0;
  
  // 大きなファイル対応: バッチごとにコミット
  const batchSize = 500;
  const commitEvery = 2000; // 2000件ごとにコミット

  let errors: string[] = [];
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      for (const row of batch) {
        if (Array.isArray(row) && row.length >= 39) {
          const rowId = `row_${count}`;
          try {
            // SAVEPOINTを使って、失敗した行だけロールバックできるようにする
            await client.query(`SAVEPOINT ${rowId}`);
            
            const horseName = (row[11] || '').trim();
            
            await client.query(`
              INSERT INTO umadata (
                race_id, date, place, course_type, distance, class_name, race_name,
                gender_limit, age_limit, waku, umaban, horse_name,
                corner_4_position, track_condition, field_size, popularity,
                finish_position, last_3f, weight_carried, horse_weight, weight_change,
                finish_time, race_count, margin, win_odds, place_odds,
                win_payout, place_payout, rpci, pci, pci3, horse_mark,
                passing_order, gender_age, jockey, trainer, sire, dam, lap_time
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35, $36, $37, $38, $39
              )
            `, [
              (row[0] || '').trim(),
              (row[1] || '').trim(),
              (row[2] || '').trim(),
              (row[3] || '').trim(),
              (row[4] || '').trim(),
              (row[5] || '').trim(),
              (row[6] || '').trim(),
              (row[7] || '').trim(),
              (row[8] || '').trim(),
              (row[9] || '').trim(),
              (row[10] || '').trim(),
              horseName,
              (row[12] || '').trim(),
              (row[13] || '').trim(),
              (row[14] || '').trim(),
              (row[15] || '').trim(),
              (row[16] || '').trim(),
              (row[17] || '').trim(),
              (row[18] || '').trim(),
              (row[19] || '').trim(),
              (row[20] || '').trim(),
              (row[21] || '').trim(),
              (row[22] || '').trim(),
              (row[23] || '').trim(),
              (row[24] || '').trim(),
              (row[25] || '').trim(),
              (row[26] || '').trim(),
              (row[27] || '').trim(),
              (row[28] || '').trim(),
              (row[29] || '').trim(),
              (row[30] || '').trim(),
              (row[31] || '').trim(),
              (row[32] || '').trim(),
              (row[33] || '').trim(),
              (row[34] || '').trim(),
              (row[35] || '').trim(),
              (row[36] || '').trim(),
              (row[37] || '').trim(),
              (row[38] || '').trim()
            ]);
            
            await client.query(`RELEASE SAVEPOINT ${rowId}`);
            inserted++;
          } catch (e: any) {
            // エラー時はSAVEPOINTまでロールバックして次の行へ
            await client.query(`ROLLBACK TO SAVEPOINT ${rowId}`);
            
            if (!e.message?.includes('duplicate')) {
              // 最初の5件のエラーのみログ
              if (errors.length < 5) {
                errors.push(`Row ${count}: ${e.message}`);
              }
            }
          }
          count++;
        }
      }
      
      // 定期的にコミット（大きなファイル対応）
      if (count > 0 && count % commitEvery === 0) {
        await client.query('COMMIT');
        await client.query('BEGIN');
        console.log(`[importUmadata] 中間コミット: ${count}/${data.length}行 (成功: ${inserted})`);
      }
      
      if ((i + batchSize) % 5000 === 0 || i + batchSize >= data.length) {
        console.log(`[importUmadata] 進捗: ${Math.min(i + batchSize, data.length)}/${data.length}行`);
      }
    }

    await client.query('COMMIT');
    
    if (errors.length > 0) {
      console.log(`[importUmadata] エラー例: ${errors.join(', ')}`);
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[importUmadata] 完了: ${inserted}件処理 (${elapsed}秒)`);

    return { count, inserted };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    throw error;
  }
}
