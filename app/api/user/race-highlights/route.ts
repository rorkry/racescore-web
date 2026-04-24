import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

/**
 * ユーザー個別のレースハイライトAPI
 *
 * その日開催のレースのうち、
 * - お気に入り馬が出走するレース
 * - 過去にレース別馬メモを書いた馬が出走するレース
 * を返す。/races/[ymd] 画面で各レースボタンに目印を付けるため。
 */

interface EntryRow {
  race_number: string;
  place: string;
  horse_name: string;
}
interface NameRow { horse_name: string; }

interface HighlightItem {
  place: string;
  raceNumber: string;
  favoriteHorses: string[];
  memoHorses: string[];
}

// 会場名から先頭・末尾の数字を落とす（"1東京1" → "東京"）
function normalizePlace(p: string): string {
  if (!p) return '';
  return p.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();
}

// 馬名正規化（$ や * の先頭記号を除去）
function normalizeHorseName(name: string): string {
  if (!name) return '';
  return name.replace(/^[\$\*＄＊\s　]+/, '').replace(/[\s　]+$/, '').trim();
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    // session.user.id を直接使う（horse-race-memos 等の他APIと統一）
    // email lookup で別のIDを取得するとuser_idが不一致になるケースがあるため
    if (!session?.user?.id) {
      // 未ログインは空配列返却（エラーにしない: UI側で何も表示しないだけ）
      return NextResponse.json({ highlights: [] });
    }
    const userId = (session.user as { id: string }).id;

    const searchParams = request.nextUrl.searchParams;
    const ymd = searchParams.get('ymd');
    if (!ymd || !/^\d{8}$/.test(ymd)) {
      return NextResponse.json({ error: 'ymd (YYYYMMDD) is required' }, { status: 400 });
    }

    const year = ymd.slice(0, 4);
    // wakujun.date は "MMDD" 形式（year は別カラム）
    const dateForDb = ymd.slice(4, 8);

    const db = getDb();

    // お気に入り馬 + メモ済み馬リストを並列取得
    const [favorites, memoed, entries] = await Promise.all([
      db.prepare('SELECT horse_name FROM favorite_horses WHERE user_id = $1').all<NameRow>(userId),
      // memo IS NOT NULL AND memo <> '' で空メモを除外（DELETE漏れ対策）
      db.prepare("SELECT DISTINCT horse_name FROM horse_race_memos WHERE user_id = $1 AND memo IS NOT NULL AND memo <> ''").all<NameRow>(userId),
      db.prepare(`
        SELECT DISTINCT race_number, place, TRIM(umamei) AS horse_name
        FROM wakujun
        WHERE date = $1 AND year = $2
      `).all<EntryRow>(dateForDb, year),
    ]);

    const favSet = new Set(favorites.map(r => normalizeHorseName(r.horse_name)));
    const memoSet = new Set(memoed.map(r => normalizeHorseName(r.horse_name)));

    if (favSet.size === 0 && memoSet.size === 0) {
      // デバッグ用: なぜ0なのかを知るため userId を含める
      return NextResponse.json({
        highlights: [],
        _debug: { favCount: 0, memoCount: 0, entriesCount: entries.length, matchedRaces: 0, userId },
      });
    }

    // レース単位に集計
    const raceMap = new Map<string, HighlightItem>();
    for (const row of entries) {
      const place = normalizePlace(row.place);
      const raceNumber = String(row.race_number);
      const horseName = normalizeHorseName(row.horse_name);
      if (!place || !raceNumber || !horseName) continue;

      const key = `${place}_${raceNumber}`;
      if (!raceMap.has(key)) {
        raceMap.set(key, {
          place,
          raceNumber,
          favoriteHorses: [],
          memoHorses: [],
        });
      }
      const item = raceMap.get(key)!;
      if (favSet.has(horseName) && !item.favoriteHorses.includes(horseName)) {
        item.favoriteHorses.push(horseName);
      }
      if (memoSet.has(horseName) && !item.memoHorses.includes(horseName)) {
        item.memoHorses.push(horseName);
      }
    }

    const highlights = Array.from(raceMap.values()).filter(
      h => h.favoriteHorses.length > 0 || h.memoHorses.length > 0
    );

    // デバッグ情報（ログインユーザー自身のデータなので露出しても問題なし）
    return NextResponse.json(
      {
        highlights,
        _debug: {
          userId,
          favCount: favSet.size,
          memoCount: memoSet.size,
          entriesCount: entries.length,
          matchedRaces: highlights.length,
          // 照合失敗時の診断用（先頭5件のみ）
          sampleMemoNames: Array.from(memoSet).slice(0, 5),
          sampleEntryNames: entries.slice(0, 5).map(e => normalizeHorseName(e.horse_name)),
        },
      },
      {
        headers: {
          // ブラウザ・CDN キャッシュは使わず、ページ再読み込みで必ず再計算させる
          'Cache-Control': 'no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('[user/race-highlights] Error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
