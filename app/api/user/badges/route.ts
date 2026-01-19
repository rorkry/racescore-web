import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser { id: string; }
interface DbBadge {
  id: string;
  badge_type: string;
  badge_level: string;
  earned_at: string;
}

// バッジ定義
const BADGE_DEFINITIONS = {
  prediction: {
    name: '予想的中',
    icon: '🎯',
    levels: [
      { level: 'bronze', label: '🥉 ブロンズ', requirement: 3, description: '◎1着的中3回' },
      { level: 'silver', label: '🥈 シルバー', requirement: 10, description: '◎1着的中10回' },
      { level: 'gold', label: '🥇 ゴールド', requirement: 30, description: '◎1着的中30回' },
      { level: 'diamond', label: '💎 ダイヤモンド', requirement: 100, description: '◎1着的中100回' },
    ]
  },
  recovery: {
    name: '回収率マスター',
    icon: '💰',
    levels: [
      { level: 'bronze', label: '🥉 ブロンズ', requirement: 80, description: '◎単勝回収率80%以上' },
      { level: 'silver', label: '🥈 シルバー', requirement: 100, description: '◎単勝回収率100%以上' },
      { level: 'gold', label: '🥇 ゴールド', requirement: 120, description: '◎単勝回収率120%以上' },
      { level: 'diamond', label: '💎 ダイヤモンド', requirement: 150, description: '◎単勝回収率150%以上' },
    ]
  },
  login: {
    name: 'ログイン継続',
    icon: '🔥',
    levels: [
      { level: 'bronze', label: '🥉 ブロンズ', requirement: 7, description: '7日連続ログイン' },
      { level: 'silver', label: '🥈 シルバー', requirement: 30, description: '30日連続ログイン' },
      { level: 'gold', label: '🥇 ゴールド', requirement: 100, description: '100日連続ログイン' },
    ]
  },
  memo: {
    name: 'メモ王',
    icon: '📝',
    levels: [
      { level: 'bronze', label: '🥉 ブロンズ', requirement: 10, description: 'メモ10件作成' },
      { level: 'silver', label: '🥈 シルバー', requirement: 50, description: 'メモ50件作成' },
      { level: 'gold', label: '🥇 ゴールド', requirement: 200, description: 'メモ200件作成' },
    ]
  }
};

// バッジ一覧取得
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    // 獲得済みバッジ
    const earnedBadges = await db.prepare(
      'SELECT badge_type, badge_level, earned_at FROM user_badges WHERE user_id = ?'
    ).all<DbBadge>(user.id);

    // 進捗状況を計算
    const predictionStats = await db.prepare(`
      SELECT COUNT(*) as cnt FROM predictions 
      WHERE user_id = ? AND mark = '◎' AND result_position = 1
    `).get<{ cnt: number }>(user.id);

    // 回収率計算
    const recoveryStats = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN result_position = 1 THEN COALESCE(tansho_payout, 0) ELSE 0 END) as return_sum
      FROM predictions WHERE user_id = ? AND mark = '◎' AND result_position IS NOT NULL
    `).get<{ total: number; return_sum: number }>(user.id);
    
    const recoveryRate = recoveryStats && recoveryStats.total >= 10 
      ? Math.round((recoveryStats.return_sum / (recoveryStats.total * 100)) * 100)
      : 0;

    const loginStats = await db.prepare(`
      SELECT MAX(streak_count) as max_streak FROM login_history WHERE user_id = ?
    `).get<{ max_streak: number | null }>(user.id);

    const memoStats = await db.prepare(`
      SELECT COUNT(*) as cnt FROM race_memos WHERE user_id = ?
    `).get<{ cnt: number }>(user.id);

    const progress = {
      prediction: predictionStats?.cnt || 0,
      recovery: recoveryRate,
      login: loginStats?.max_streak || 0,
      memo: memoStats?.cnt || 0
    };

    return NextResponse.json({
      earnedBadges,
      progress,
      definitions: BADGE_DEFINITIONS
    });
  } catch (error) {
    console.error('Badges fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// バッジ獲得チェック＆付与
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const now = new Date().toISOString();
    const newBadges: { type: string; level: string; label: string }[] = [];

    // 予想的中バッジチェック
    const predictionResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM predictions 
      WHERE user_id = ? AND mark = '◎' AND result_position = 1
    `).get<{ cnt: number }>(user.id);
    const predictionCount = predictionResult?.cnt || 0;

    for (const levelDef of BADGE_DEFINITIONS.prediction.levels) {
      if (predictionCount >= levelDef.requirement) {
        const existing = await db.prepare(
          'SELECT id FROM user_badges WHERE user_id = ? AND badge_type = ? AND badge_level = ?'
        ).get(user.id, 'prediction', levelDef.level);

        if (!existing) {
          const id = randomUUID();
          await db.prepare(`
            INSERT INTO user_badges (id, user_id, badge_type, badge_level, earned_at)
            VALUES (?, ?, 'prediction', ?, ?)
          `).run(id, user.id, levelDef.level, now);
          newBadges.push({ type: 'prediction', level: levelDef.level, label: levelDef.label });

          const notifId = randomUUID();
          await db.prepare(`
            INSERT INTO notifications (id, user_id, type, title, message, created_at)
            VALUES (?, ?, 'badge', ?, ?, ?)
          `).run(notifId, user.id, `バッジ獲得！${levelDef.label}`, levelDef.description, now);
        }
      }
    }

    // ログインバッジチェック
    const loginResult = await db.prepare(`
      SELECT MAX(streak_count) as max FROM login_history WHERE user_id = ?
    `).get<{ max: number | null }>(user.id);
    const maxStreak = loginResult?.max || 0;

    for (const levelDef of BADGE_DEFINITIONS.login.levels) {
      if (maxStreak >= levelDef.requirement) {
        const existing = await db.prepare(
          'SELECT id FROM user_badges WHERE user_id = ? AND badge_type = ? AND badge_level = ?'
        ).get(user.id, 'login', levelDef.level);

        if (!existing) {
          const id = randomUUID();
          await db.prepare(`
            INSERT INTO user_badges (id, user_id, badge_type, badge_level, earned_at)
            VALUES (?, ?, 'login', ?, ?)
          `).run(id, user.id, levelDef.level, now);
          newBadges.push({ type: 'login', level: levelDef.level, label: levelDef.label });
        }
      }
    }

    // メモバッジチェック
    const memoResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM race_memos WHERE user_id = ?
    `).get<{ cnt: number }>(user.id);
    const memoCount = memoResult?.cnt || 0;

    for (const levelDef of BADGE_DEFINITIONS.memo.levels) {
      if (memoCount >= levelDef.requirement) {
        const existing = await db.prepare(
          'SELECT id FROM user_badges WHERE user_id = ? AND badge_type = ? AND badge_level = ?'
        ).get(user.id, 'memo', levelDef.level);

        if (!existing) {
          const id = randomUUID();
          await db.prepare(`
            INSERT INTO user_badges (id, user_id, badge_type, badge_level, earned_at)
            VALUES (?, ?, 'memo', ?, ?)
          `).run(id, user.id, levelDef.level, now);
          newBadges.push({ type: 'memo', level: levelDef.level, label: levelDef.label });
        }
      }
    }

    // 回収率バッジチェック
    const recoveryCheck = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN result_position = 1 THEN COALESCE(tansho_payout, 0) ELSE 0 END) as return_sum
      FROM predictions WHERE user_id = ? AND mark = '◎' AND result_position IS NOT NULL
    `).get<{ total: number; return_sum: number }>(user.id);

    if (recoveryCheck && recoveryCheck.total >= 10) {
      const recoveryRate = Math.round((recoveryCheck.return_sum / (recoveryCheck.total * 100)) * 100);

      for (const levelDef of BADGE_DEFINITIONS.recovery.levels) {
        if (recoveryRate >= levelDef.requirement) {
          const existing = await db.prepare(
            'SELECT id FROM user_badges WHERE user_id = ? AND badge_type = ? AND badge_level = ?'
          ).get(user.id, 'recovery', levelDef.level);

          if (!existing) {
            const id = randomUUID();
            await db.prepare(`
              INSERT INTO user_badges (id, user_id, badge_type, badge_level, earned_at)
              VALUES (?, ?, 'recovery', ?, ?)
            `).run(id, user.id, levelDef.level, now);
            newBadges.push({ type: 'recovery', level: levelDef.level, label: levelDef.label });

            const notifId = randomUUID();
            await db.prepare(`
              INSERT INTO notifications (id, user_id, type, title, message, created_at)
              VALUES (?, ?, 'badge', ?, ?, ?)
            `).run(notifId, user.id, `バッジ獲得！${levelDef.label}`, levelDef.description, now);
          }
        }
      }
    }

    return NextResponse.json({ newBadges });
  } catch (error) {
    console.error('Badge check error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
