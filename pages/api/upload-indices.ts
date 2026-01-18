import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';

interface IndexData {
  race_id: string;
  L4F?: number;
  T2F?: number;
  potential?: number;
  revouma?: number;
  makikaeshi?: number;
  cushion?: number;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // 大量データ対応
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data } = req.body as { data: IndexData[] };

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    const client = await pool.connect();

    try {
      // トランザクション開始
      await client.query('BEGIN');

      // バッチ処理（1000件ずつ）
      const batchSize = 1000;
      let processed = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        for (const item of batch) {
          await client.query(`
            INSERT INTO indices (race_id, "L4F", "T2F", potential, revouma, makikaeshi, cushion, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT(race_id) DO UPDATE SET
              "L4F" = COALESCE($2, indices."L4F"),
              "T2F" = COALESCE($3, indices."T2F"),
              potential = COALESCE($4, indices.potential),
              revouma = COALESCE($5, indices.revouma),
              makikaeshi = COALESCE($6, indices.makikaeshi),
              cushion = COALESCE($7, indices.cushion),
              updated_at = NOW()
          `, [
            item.race_id,
            item.L4F ?? null,
            item.T2F ?? null,
            item.potential ?? null,
            item.revouma ?? null,
            item.makikaeshi ?? null,
            item.cushion ?? null
          ]);
        }
        
        processed += batch.length;
        console.log(`[upload-indices] Processed ${processed}/${data.length}`);
      }

      // トランザクションコミット
      await client.query('COMMIT');
      
      client.release();
      await pool.end();

      return res.status(200).json({
        success: true,
        message: `${data.length}件の指数データを保存しました`,
        count: data.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('Error uploading indices:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
