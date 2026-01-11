import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';

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

    const db = getRawDb();

    // indicesテーブルを作成（存在しない場合）
    db.exec(`
      CREATE TABLE IF NOT EXISTS indices (
        race_id TEXT PRIMARY KEY,
        L4F REAL,
        T2F REAL,
        potential REAL,
        revouma REAL,
        makikaeshi REAL,
        cushion REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // UPSERT用のステートメントを準備
    const upsertStmt = db.prepare(`
      INSERT INTO indices (race_id, L4F, T2F, potential, revouma, makikaeshi, cushion, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(race_id) DO UPDATE SET
        L4F = excluded.L4F,
        T2F = excluded.T2F,
        potential = excluded.potential,
        revouma = excluded.revouma,
        makikaeshi = excluded.makikaeshi,
        cushion = excluded.cushion,
        updated_at = CURRENT_TIMESTAMP
    `);

    // トランザクションで一括挿入
    const insertMany = db.transaction((items: IndexData[]) => {
      for (const item of items) {
        upsertStmt.run(
          item.race_id,
          item.L4F ?? null,
          item.T2F ?? null,
          item.potential ?? null,
          item.revouma ?? null,
          item.makikaeshi ?? null,
          item.cushion ?? null
        );
      }
    });

    insertMany(data);
    // シングルトン接続は閉じない

    return res.status(200).json({
      success: true,
      message: `${data.length}件の指数データを保存しました`,
      count: data.length,
    });
  } catch (error) {
    console.error('Error uploading indices:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
