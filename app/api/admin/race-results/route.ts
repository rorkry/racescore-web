import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

// レース結果を入力して予想と照合
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { raceKey, results } = await request.json();
    // results: [{ horseNumber: '1', position: 1 }, { horseNumber: '2', position: 2 }, ...]

    if (!raceKey || !results || !Array.isArray(results)) {
      return NextResponse.json({ error: 'レースキーと結果は必須です' }, { status: 400 });
    }

    const db = getDb();
    let updatedCount = 0;
    let honmeiHitCount = 0;

    // 各馬の結果を予想テーブルに反映
    for (const result of results) {
      const { horseNumber, position } = result;
      if (!horseNumber || position === undefined) continue;

      // この馬に予想を付けた全ユーザーの予想を更新
      const predictions = db.prepare(`
        SELECT id, mark FROM predictions WHERE race_key = ? AND horse_number = ?
      `).all(raceKey, horseNumber) as { id: string; mark: string }[];

      for (const pred of predictions) {
        // ◎で1着なら的中
        const isHit = pred.mark === '◎' && position === 1 ? 1 : 0;
        
        db.prepare(`
          UPDATE predictions SET result_position = ?, is_hit = ? WHERE id = ?
        `).run(position, isHit, pred.id);
        
        updatedCount++;
        if (isHit) honmeiHitCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      updatedCount,
      honmeiHitCount,
      message: `${updatedCount}件の予想を更新、${honmeiHitCount}件の◎1着的中`
    });
  } catch (error) {
    console.error('Race results update error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// レースの予想状況取得（管理者用）
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const raceKey = searchParams.get('raceKey');

    if (!raceKey) {
      return NextResponse.json({ error: 'レースキーは必須です' }, { status: 400 });
    }

    const db = getDb();
    
    // このレースの全予想を取得
    const predictions = db.prepare(`
      SELECT 
        p.horse_number,
        p.mark,
        p.result_position,
        p.is_hit,
        u.email as user_email
      FROM predictions p
      JOIN users u ON p.user_id = u.id
      WHERE p.race_key = ?
      ORDER BY p.horse_number
    `).all(raceKey);

    // 馬番ごとの印の集計
    const summary = db.prepare(`
      SELECT 
        horse_number,
        mark,
        COUNT(*) as count
      FROM predictions
      WHERE race_key = ?
      GROUP BY horse_number, mark
      ORDER BY horse_number, mark
    `).all(raceKey);

    return NextResponse.json({ predictions, summary });
  } catch (error) {
    console.error('Race predictions fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
