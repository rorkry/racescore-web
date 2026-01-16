import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser { id: string; }
interface DbPrediction {
  id: string;
  race_key: string;
  horse_number: string;
  mark: string;
  result_position: number | null;
  is_hit: number;
  tansho_payout: number | null;  // 単勝配当（100円あたり）
  fukusho_payout: number | null; // 複勝配当（100円あたり）
  created_at: string;
  like_count?: number;
}

// 予想取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const raceKey = searchParams.get('raceKey');

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    let predictions: DbPrediction[];
    if (raceKey) {
      predictions = db.prepare(`
        SELECT p.*, (SELECT COUNT(*) FROM prediction_likes WHERE prediction_id = p.id) as like_count
        FROM predictions p WHERE p.user_id = ? AND p.race_key = ?
      `).all(user.id, raceKey) as DbPrediction[];
    } else {
      predictions = db.prepare(`
        SELECT p.*, (SELECT COUNT(*) FROM prediction_likes WHERE prediction_id = p.id) as like_count
        FROM predictions p WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 100
      `).all(user.id) as DbPrediction[];
    }

    // 成績計算（◎印のみで回収率計算）
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN mark = '◎' AND result_position = 1 THEN 1 ELSE 0 END) as honmei_hit,
        SUM(CASE WHEN mark = '◎' THEN 1 ELSE 0 END) as honmei_total,
        SUM(CASE WHEN mark = '◎' AND result_position <= 3 THEN 1 ELSE 0 END) as honmei_fukusho_hit,
        SUM(CASE WHEN is_hit = 1 THEN 1 ELSE 0 END) as total_hit,
        SUM(CASE WHEN mark = '◎' AND result_position = 1 THEN COALESCE(tansho_payout, 0) ELSE 0 END) as tansho_return,
        SUM(CASE WHEN mark = '◎' AND result_position <= 3 THEN COALESCE(fukusho_payout, 0) ELSE 0 END) as fukusho_return
      FROM predictions WHERE user_id = ? AND result_position IS NOT NULL
    `).get(user.id) as { 
      total: number; 
      honmei_hit: number; 
      honmei_total: number; 
      honmei_fukusho_hit: number;
      total_hit: number;
      tansho_return: number;
      fukusho_return: number;
    };

    // 回収率計算（◎印の単勝・複勝）
    const honmeiCount = stats.honmei_total || 0;
    const tanshoRecoveryRate = honmeiCount > 0 ? Math.round((stats.tansho_return / (honmeiCount * 100)) * 100) : 0;
    const fukushoRecoveryRate = honmeiCount > 0 ? Math.round((stats.fukusho_return / (honmeiCount * 100)) * 100) : 0;

    return NextResponse.json({ 
      predictions, 
      stats: {
        ...stats,
        tanshoRecoveryRate,    // ◎単勝回収率
        fukushoRecoveryRate,   // ◎複勝回収率
      }
    });
  } catch (error) {
    console.error('Predictions fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 予想保存（markがnull/空の場合は削除）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { raceKey, horseNumber, mark } = await request.json();
    if (!raceKey || !horseNumber) {
      return NextResponse.json({ error: 'レースキーと馬番は必須です' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    // markがnull/空の場合は削除
    if (!mark) {
      db.prepare('DELETE FROM predictions WHERE user_id = ? AND race_key = ? AND horse_number = ?')
        .run(user.id, raceKey, horseNumber);
      return NextResponse.json({ success: true, deleted: true });
    }

    const validMarks = ['◎', '○', '▲', '△', '×'];
    if (!validMarks.includes(mark)) {
      return NextResponse.json({ error: '無効な印です' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 既存の予想があれば更新、なければ新規作成
    const existing = db.prepare(
      'SELECT id, result_position FROM predictions WHERE user_id = ? AND race_key = ? AND horse_number = ?'
    ).get(user.id, raceKey, horseNumber) as { id: string; result_position: number | null } | undefined;

    // 既に結果が出ているレースは変更不可
    if (existing && existing.result_position !== null) {
      return NextResponse.json({ error: '確定済みのレースは変更できません' }, { status: 400 });
    }

    if (existing) {
      db.prepare('UPDATE predictions SET mark = ? WHERE id = ?').run(mark, existing.id);
      return NextResponse.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO predictions (id, user_id, race_key, horse_number, mark, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, user.id, raceKey, horseNumber, mark, now);
      return NextResponse.json({ success: true, id, created: true });
    }
  } catch (error) {
    console.error('Prediction save error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 予想削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { raceKey, horseNumber } = await request.json();

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    db.prepare('DELETE FROM predictions WHERE user_id = ? AND race_key = ? AND horse_number = ?')
      .run(user.id, raceKey, horseNumber);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Prediction delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
