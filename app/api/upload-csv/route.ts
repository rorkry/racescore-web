import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { auth } from '@/lib/auth';
import { checkRateLimit, getRateLimitIdentifier, strictRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // 管理者認証チェック
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }
    
    // 管理者権限チェック（roleがadminかどうか）
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // Rate Limiting（厳格：1分に10回まで）
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

    // ファイルをArrayBufferとして読み込み
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Shift_JIS (CP932) からUTF-8に変換
    let text: string;
    try {
      text = iconv.decode(buffer, 'Shift_JIS');
    } catch {
      text = buffer.toString('utf-8');
    }
    
    // CSVをパース（ヘッダーなし）
    const { data } = Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
    });

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'CSVデータが空です' }, { status: 400 });
    }

    // PostgreSQL接続
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    const client = await pool.connect();

    try {
      // ファイル名でテーブルを判定
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  // 既存データ確認
  const existingResult = await client.query(
    'SELECT COUNT(*) as count FROM wakujun WHERE date = $1 AND year = $2',
    [date, year]
  );
  const isUpdate = existingResult.rows[0].count > 0;

  // トランザクション開始
  await client.query('BEGIN');

  try {
    // 同じ年・日付のデータを削除
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

async function importUmadata(client: any, data: any[]): Promise<{ count: number; inserted: number }> {
  console.log(`[importUmadata] 開始: ${data.length}行`);
  const startTime = Date.now();

  await client.query('BEGIN');

  try {
    let count = 0;
    let inserted = 0;
    
    // バッチ処理（100行ずつ）
    const batchSize = 100;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      for (const row of batch) {
        if (Array.isArray(row) && row.length >= 42) {
          try {
            await client.query(`
              INSERT INTO umadata (
                race_id_new_no_horse_num, date, distance, horse_number, horse_name, index_value,
                class_name, track_condition, finish_position, last_3f, finish_time, standard_time,
                rpci, pci, good_run, pci3, horse_mark, corner_2, corner_3, corner_4, gender, age,
                horse_weight, weight_change, jockey_weight, jockey, multiple_entries, affiliation,
                trainer, place, number_of_horses, popularity, sire, dam, track_condition_2, place_2,
                margin, corner_1, corner_2_2, corner_3_2, corner_4_2, work_1s
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
                $41, $42
              )
              ON CONFLICT (id) DO NOTHING
            `, [
              row[0], row[1], row[2], row[3], row[4], row[5],
              row[6], row[7], row[8], row[9], row[10], row[11],
              row[12], row[13], row[14], row[15], row[16], row[17],
              row[18], row[19], row[20], row[21], row[22], row[23],
              row[24], row[25], row[26], row[27], row[28], row[29],
              row[30], row[31], row[32], row[33], row[34], row[35],
              row[36], row[37], row[38], row[39], row[40], row[41]
            ]);
            inserted++;
          } catch (e: any) {
            // 重複エラーは無視
            if (!e.message.includes('duplicate')) {
              console.error('Error processing umadata row:', e.message);
            }
          }
          count++;
        }
      }
      
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= data.length) {
        console.log(`[importUmadata] 進捗: ${Math.min(i + batchSize, data.length)}/${data.length}行`);
      }
    }

    await client.query('COMMIT');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[importUmadata] 完了: ${inserted}件処理 (${elapsed}秒)`);

    return { count, inserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
