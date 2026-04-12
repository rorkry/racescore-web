import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

const MAX_LEN = 32000;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const row = await db
      .prepare(
        `SELECT content, updated_at FROM user_maxims WHERE user_id = ?`
      )
      .get<{ content: string; updated_at: string }>(session.user.id);

    return NextResponse.json({
      content: row?.content ?? '',
      updatedAt: row?.updated_at ?? null,
    });
  } catch (e) {
    console.error('[user/maxims GET]', e);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const body = await request.json();
    const raw = typeof body.content === 'string' ? body.content : '';
    if (raw.length > MAX_LEN) {
      return NextResponse.json(
        { error: `格言は${MAX_LEN}文字以内にしてください` },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = new Date().toISOString();
    const existing = await db
      .prepare(`SELECT user_id FROM user_maxims WHERE user_id = ?`)
      .get<{ user_id: string }>(session.user.id);

    if (existing) {
      await db
        .prepare(`UPDATE user_maxims SET content = ?, updated_at = ? WHERE user_id = ?`)
        .run(raw, now, session.user.id);
    } else {
      await db
        .prepare(
          `INSERT INTO user_maxims (user_id, content, updated_at) VALUES (?, ?, ?)`
        )
        .run(session.user.id, raw, now);
    }

    return NextResponse.json({ success: true, updatedAt: now });
  } catch (e) {
    console.error('[user/maxims PUT]', e);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
