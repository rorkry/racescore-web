/**
 * 今日の注目馬 API
 * GET → ログインユーザーのお気に入り馬 & 今走メモ馬 で今日出走する馬一覧を返す
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface AlertHorse {
  horse_name: string;
  place: string;
  race_number: string;
  class_name: string;
  memo?: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  // 今日の日付を yyyy.mm.dd 形式で生成（umadata.date カラムの形式）
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayDate = `${yyyy}.${mm}.${dd}`;  // e.g. "2026.04.06"
  const todayPrefix = `${yyyy}${mm}${dd}`;  // e.g. "20260406" (race_id先頭8桁)

  try {
    // 今日出走する馬を取得（DISTINCT ON で重複排除）
    const todayRunners = await db.query<{
      horse_name: string;
      place: string;
      race_id: string;
      class_name: string;
    }>(
      `SELECT DISTINCT ON (horse_name)
         horse_name, place, race_id, class_name
       FROM umadata
       WHERE date = $1 OR race_id LIKE $2
       ORDER BY horse_name, race_id`,
      [todayDate, `${todayPrefix}%`]
    );

    // 馬名 → 出走情報 のマップ
    const runnersMap = new Map<string, { place: string; race_number: string; class_name: string }>();
    for (const r of todayRunners) {
      const raceNum = r.race_id?.length >= 2
        ? String(parseInt(r.race_id.slice(-2), 10))
        : '';
      runnersMap.set((r.horse_name || '').trim(), {
        place: r.place || '',
        race_number: raceNum,
        class_name: r.class_name || '',
      });
    }

    if (runnersMap.size === 0) {
      return NextResponse.json({ favorites: [], memoHorses: [] });
    }

    // ① お気に入り馬
    const favRows = await db.query<{ horse_name: string }>(
      `SELECT horse_name FROM favorite_horses WHERE user_id = $1`,
      [userId]
    );
    const favorites: AlertHorse[] = [];
    for (const fav of favRows) {
      const name = (fav.horse_name || '').trim();
      const info = runnersMap.get(name);
      if (info) {
        favorites.push({ horse_name: name, ...info });
      }
    }

    // ② 今走メモがある馬（直近レースのメモ）
    const memoRows = await db.query<{ horse_name: string; memo: string; race_key: string }>(
      `SELECT DISTINCT ON (horse_name)
         horse_name, memo, race_key
       FROM horse_race_memos
       WHERE user_id = $1
       ORDER BY horse_name, updated_at DESC`,
      [userId]
    );
    const memoHorses: AlertHorse[] = [];
    const favNames = new Set(favorites.map(f => f.horse_name));
    for (const m of memoRows) {
      const name = (m.horse_name || '').trim();
      // お気に入りと重複する馬はfavoritesに含まれているのでスキップしない
      const info = runnersMap.get(name);
      if (info) {
        memoHorses.push({ horse_name: name, ...info, memo: m.memo || '' });
      }
    }

    return NextResponse.json({ favorites, memoHorses });
  } catch (error) {
    console.error('[today-alerts] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
