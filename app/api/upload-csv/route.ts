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

    const tourokuYear = (formData.get('tourokuYear') as string | null)?.trim() ?? '';
    const tourokuDate = (formData.get('tourokuDate') as string | null)?.trim() ?? '';
    const tourokuPlace = (formData.get('tourokuPlace') as string | null)?.trim() ?? '';
    const tourokuRaceNumber = (formData.get('tourokuRaceNumber') as string | null)?.trim() ?? '';

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
      const lower = file.name.toLowerCase();
      if (lower.includes('touroku') && !lower.includes('wakujun')) {
        const meta = resolveTourokuMeta(file.name, {
          year: tourokuYear,
          date: tourokuDate,
          place: tourokuPlace,
          raceNumber: tourokuRaceNumber,
        });
        const result = await importTourokuWakujun(client, data, meta);
        client.release();
        await pool.end();
        return NextResponse.json({
          success: true,
          count: result.count,
          table: 'wakujun',
          date: meta.date,
          place: meta.place,
          raceNumber: meta.raceNumber,
          message: `特別登録 ${meta.place} ${meta.raceNumber}R（${meta.date}）に${result.count}頭を取り込みました（枠なし・馬番順）`,
        });
      }
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
        return NextResponse.json({ error: 'ファイル名に touroku / wakujun / umadata のいずれかを含めてください' }, { status: 400 });
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

/** 例: touroku0419_阪神_11.csv → MMDD・場・R */
function parseTourokuFilename(fileName: string): { date: string; place: string; raceNumber: string } | null {
  const m = fileName.match(/touroku\s*_?(\d{4})_([^_/\\]+?)_(\d{1,2})/i);
  if (!m) return null;
  return {
    date: m[1],
    place: m[2].trim(),
    raceNumber: String(parseInt(m[3], 10)),
  };
}

function resolveTourokuMeta(
  fileName: string,
  form: { year: string; date: string; place: string; raceNumber: string }
): { year: string; date: string; place: string; raceNumber: string } {
  const parsed = parseTourokuFilename(fileName);
  const year = form.year || String(new Date().getFullYear());
  const date = form.date || parsed?.date || '';
  const place = form.place || parsed?.place || '';
  const raceNumber = form.raceNumber || parsed?.raceNumber || '';
  return { year, date, place, raceNumber };
}

/**
 * JRA 特別登録CSV（枠なし・馬番のみ・Shift_JIS）
 * 列例: [0]=仮, [2]=馬番, [11]=馬名, [13]=性別, [14]=年齢, [17]=斤量, [20]=調教師, [22][23]=牧場, [24]=毛色, [25]=生年月日
 */
async function importTourokuWakujun(
  client: any,
  data: any[],
  meta: { year: string; date: string; place: string; raceNumber: string }
): Promise<{ count: number }> {
  const { year, date, place, raceNumber } = meta;
  if (!/^\d{4}$/.test(date)) {
    throw new Error(
      '特別登録CSV: 開催日（MMDD・4桁）と場所・レース番号を指定してください。ファイル名例: touroku0419_阪神_11.csv または管理画面の入力欄に入力してください。'
    );
  }
  if (!place) {
    throw new Error('特別登録CSV: 場所（例: 阪神）を入力するか、ファイル名に含めてください（touroku0419_阪神_11.csv）。');
  }
  if (!raceNumber) {
    throw new Error('特別登録CSV: レース番号を入力するか、ファイル名に含めてください。');
  }
  if (!/^\d{4}$/.test(year)) {
    throw new Error('特別登録CSV: 年（4桁）を指定してください。');
  }

  const validRows = data.filter((row) => Array.isArray(row) && row.length >= 12);
  const tosuStr = String(
    validRows.filter((row) => String((row as any[])[2] ?? '').trim() && String((row as any[])[11] ?? '').trim()).length
  );

  await client.query('BEGIN');
  try {
    await client.query(
      'DELETE FROM wakujun WHERE date = $1 AND year = $2 AND place = $3 AND race_number = $4',
      [date, year, place, raceNumber]
    );

    let count = 0;
    for (const row of data) {
      if (!Array.isArray(row) || row.length < 12) continue;
      const umaban = String((row[2] ?? '').trim());
      const umamei = String((row[11] ?? '').trim());
      if (!umaban || !umamei) continue;

      await client.query(
        `
            INSERT INTO wakujun (
              year, date, place, race_number, class_name_1, class_name_2,
              waku, umaban, kinryo, umamei, seibetsu, nenrei, nenrei_display,
              kishu, track_type, distance, tosu,
              shozoku, chokyoshi, shozoku_chi, umajirushi
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          `,
        [
          year,
          date,
          place,
          raceNumber,
          '特別登録',
          '',
          '',
          umaban,
          String((row[17] ?? '').trim()),
          umamei,
          String((row[13] ?? '').trim()),
          String((row[14] ?? '').trim()),
          String((row[25] ?? '').trim()),
          '',
          '',
          '',
          tosuStr,
          String((row[22] ?? '').trim()),
          String((row[20] ?? '').trim()),
          String((row[23] ?? '').trim()),
          String((row[24] ?? '').trim()),
        ]
      );
      count++;
    }

    if (count === 0) {
      throw new Error(
        '特別登録CSVから有効な行が0件でした。Shift_JISのCSVか、馬番(列3)・馬名(列12)がある行を含むか確認してください。'
      );
    }

    await client.query('COMMIT');
    return { count };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
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
 * umadataフォーマット（47列） - umadata.csv形式
 * 0: race_id - レースID(新/馬番無)
 * 1: date - 日付(yyyy.mm.dd)
 * 2: place - 場所
 * 3: course_type - 芝(内・外)
 * 4: distance - 距離
 * 5: class_name - クラス名
 * 6: race_name - レース名
 * 7: gender_limit - 性別限定
 * 8: age_limit - 年齢限定
 * 9: waku - 枠番
 * 10: umaban - 馬番
 * 11: horse_name - 馬名S
 * 12: index_value - 指数（4角位置として保存）
 * 13: track_condition - 馬場状態
 * 14: field_size - 頭数
 * 15: popularity - 人気
 * 16: finish_position - 着順
 * 17: last_3f - 上り3F
 * 18: weight_carried - 斤量
 * 19: horse_weight - 馬体重
 * 20: weight_change - 馬体重増減
 * 21: finish_time - 走破タイム
 * 22: race_count - 休み明け～戦目
 * 23: margin - 着差
 * 24: win_odds - 単勝オッズ
 * 25: place_odds_low - 複勝オッズ下限
 * 26: place_odds_high - 複勝オッズ上限
 * 27: win_payout - 単勝配当
 * 28: place_payout - 複勝配当
 * 29: rpci - RPCI
 * 30: pci - PCI
 * 31: good_run - 好走
 * 32: pci3 - PCI3
 * 33: horse_mark - 馬印
 * 34: corner_1 - 1角
 * 35: corner_2 - 2角
 * 36: corner_3 - 3角
 * 37: corner_4 - 4角
 * 38: gender - 性別
 * 39: age - 年齢
 * 40: jockey - 騎手
 * 41: multi_entry - 多頭出し
 * 42: affiliation - 所属
 * 43: trainer - 調教師
 * 44: sire - 種牡馬
 * 45: dam - 母馬
 * 46: lap_time - ワーク1（ラップタイム）
 * 47: work_2 - ワーク2
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
        // 47列または48列のCSVに対応
        if (Array.isArray(row) && row.length >= 47) {
          const rowId = `row_${count}`;
          try {
            // SAVEPOINTを使って、失敗した行だけロールバックできるようにする
            await client.query(`SAVEPOINT ${rowId}`);
            
            const horseName = (row[11] || '').trim();
            
            await client.query(`
              INSERT INTO umadata (
                race_id, date, place, course_type, distance, class_name, race_name,
                gender_limit, age_limit, waku, umaban, horse_name,
                index_value, track_condition, field_size, popularity,
                finish_position, last_3f, weight_carried, horse_weight, weight_change,
                finish_time, race_count, margin, win_odds, place_odds_low,
                place_odds_high, win_payout, place_payout, rpci, pci, good_run,
                pci3, horse_mark, corner_1, corner_2, corner_3, corner_4,
                gender, age, jockey, multi_entry, affiliation, trainer, sire, dam, lap_time, work_2
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
                $41, $42, $43, $44, $45, $46, $47, $48
              )
            `, [
              (row[0] || '').trim(),   // race_id
              (row[1] || '').trim(),   // date
              (row[2] || '').trim(),   // place
              (row[3] || '').trim(),   // course_type
              (row[4] || '').trim(),   // distance
              (row[5] || '').trim(),   // class_name
              (row[6] || '').trim(),   // race_name
              (row[7] || '').trim(),   // gender_limit
              (row[8] || '').trim(),   // age_limit
              (row[9] || '').trim(),   // waku
              (row[10] || '').trim(),  // umaban
              horseName,               // horse_name
              (row[12] || '').trim(),  // index_value
              (row[13] || '').trim(),  // track_condition
              (row[14] || '').trim(),  // field_size
              (row[15] || '').trim(),  // popularity
              (row[16] || '').trim(),  // finish_position
              (row[17] || '').trim(),  // last_3f
              (row[18] || '').trim(),  // weight_carried
              (row[19] || '').trim(),  // horse_weight
              (row[20] || '').trim(),  // weight_change
              (row[21] || '').trim(),  // finish_time
              (row[22] || '').trim(),  // race_count
              (row[23] || '').trim(),  // margin
              (row[24] || '').trim(),  // win_odds
              (row[25] || '').trim(),  // place_odds_low
              (row[26] || '').trim(),  // place_odds_high
              (row[27] || '').trim(),  // win_payout
              (row[28] || '').trim(),  // place_payout
              (row[29] || '').trim(),  // rpci
              (row[30] || '').trim(),  // pci
              (row[31] || '').trim(),  // good_run
              (row[32] || '').trim(),  // pci3
              (row[33] || '').trim(),  // horse_mark
              (row[34] || '').trim(),  // corner_1
              (row[35] || '').trim(),  // corner_2
              (row[36] || '').trim(),  // corner_3
              (row[37] || '').trim(),  // corner_4
              (row[38] || '').trim(),  // gender
              (row[39] || '').trim(),  // age
              (row[40] || '').trim(),  // jockey
              (row[41] || '').trim(),  // multi_entry
              (row[42] || '').trim(),  // affiliation
              (row[43] || '').trim(),  // trainer
              (row[44] || '').trim(),  // sire
              (row[45] || '').trim(),  // dam
              (row[46] || '').trim(),  // lap_time
              (row[47] || '').trim()   // work_2
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
