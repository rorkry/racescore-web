import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser { id: string; }
interface DbBabaMemo {
  id: string;
  date: string;
  track_type: string;
  place: string | null;
  course_type: string | null;
  course_condition: string | null;
  advantage_position: string | null;
  advantage_style: string | null;
  weather_note: string | null;
  free_memo: string | null;
  created_at: string;
  updated_at: string;
}

// 馬場メモ取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const trackType = searchParams.get('trackType');

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    if (date && trackType) {
      const memo = await db.prepare(
        'SELECT * FROM baba_memos WHERE user_id = ? AND date = ? AND track_type = ?'
      ).get<DbBabaMemo>(user.id, date, trackType);
      return NextResponse.json({ memo: memo || null });
    } else if (date) {
      const memos = await db.prepare(
        'SELECT * FROM baba_memos WHERE user_id = ? AND date = ? ORDER BY track_type'
      ).all<DbBabaMemo>(user.id, date);
      return NextResponse.json({ memos });
    } else {
      const memos = await db.prepare(
        'SELECT * FROM baba_memos WHERE user_id = ? ORDER BY date DESC, track_type LIMIT 100'
      ).all<DbBabaMemo>(user.id);
      return NextResponse.json({ memos });
    }
  } catch (error) {
    console.error('Baba memos fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 馬場メモ保存/更新
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { date, trackType, place, courseType, courseCondition, advantagePosition, advantageStyle, weatherNote, freeMemo } = await request.json();
    
    if (!date || !trackType) {
      return NextResponse.json({ error: '日付とトラックタイプ（芝/ダート）は必須です' }, { status: 400 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const now = new Date().toISOString();
    const existing = await db.prepare(
      'SELECT id FROM baba_memos WHERE user_id = ? AND date = ? AND track_type = ?'
    ).get<{ id: string }>(user.id, date, trackType);

    if (existing) {
      await db.prepare(`
        UPDATE baba_memos SET 
          place = ?, course_type = ?, course_condition = ?, advantage_position = ?, 
          advantage_style = ?, weather_note = ?, free_memo = ?, updated_at = ?
        WHERE id = ?
      `).run(place, courseType, courseCondition, advantagePosition, advantageStyle, weatherNote, freeMemo, now, existing.id);
      return NextResponse.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = randomUUID();
      await db.prepare(`
        INSERT INTO baba_memos (id, user_id, date, track_type, place, course_type, course_condition, 
          advantage_position, advantage_style, weather_note, free_memo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, user.id, date, trackType, place, courseType, courseCondition, advantagePosition, advantageStyle, weatherNote, freeMemo, now, now);
      return NextResponse.json({ success: true, id, created: true });
    }
  } catch (error) {
    console.error('Baba memo save error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 馬場メモ削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const trackType = searchParams.get('trackType');

    if (!date || !trackType) {
      return NextResponse.json({ error: '日付とトラックタイプは必須です' }, { status: 400 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    await db.prepare('DELETE FROM baba_memos WHERE user_id = ? AND date = ? AND track_type = ?').run(user.id, date, trackType);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Baba memo delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
