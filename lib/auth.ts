// /lib/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import bcrypt from 'bcryptjs';
import { getDb } from './db';

// ユーザー型定義
interface DbUser {
  id: string;
  email: string;
  password_hash: string | null;
  name: string | null;
  role: string;
  image: string | null;
}

// 管理者メールアドレス（環境変数で設定、カンマ区切りで複数可）
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || 'admin@stride.jp').split(',').map(e => e.trim());

// Google認証が設定されているかチェック
const isGoogleConfigured = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

// 認証設定
export const authConfig: NextAuthConfig = {
  providers: [
    // Google認証（環境変数が設定されている場合のみ有効）
    ...(isGoogleConfigured ? [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    ] : []),
    // メール/パスワード認証
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          const db = getDb();
          
          // データベースからユーザーを検索（非同期）
          const user = await db.prepare(
            'SELECT id, email, password_hash, name, role FROM users WHERE email = ?'
          ).get<DbUser>(email);

          if (!user || !user.password_hash) {
            return null;
          }

          // パスワード検証
          const isValid = await bcrypt.compare(password, user.password_hash);
          if (!isValid) {
            return null;
          }

          // 管理者メールアドレスの場合はroleをadminに
          const role = ADMIN_EMAILS.includes(user.email) ? 'admin' : user.role;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: role,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Google認証の場合、ユーザーを自動作成/更新
      if (account?.provider === 'google' && user.email) {
        try {
          const db = getDb();
          
          // 既存ユーザーを検索
          const existingUser = await db.prepare(
            'SELECT id, role FROM users WHERE email = ?'
          ).get<{ id: string; role: string }>(user.email);

          if (existingUser) {
            // 既存ユーザーの場合、名前と画像を更新
            await db.prepare(
              'UPDATE users SET name = ?, image = ?, updated_at = NOW() WHERE id = ?'
            ).run(user.name || '', user.image || '', existingUser.id);
            
            // IDをユーザーオブジェクトに設定
            user.id = existingUser.id;
          } else {
            // 新規ユーザーを作成
            const newId = crypto.randomUUID();
            const role = ADMIN_EMAILS.includes(user.email) ? 'admin' : 'user';
            
            await db.prepare(`
              INSERT INTO users (id, email, name, image, role, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, NOW(), NOW())
            `).run(newId, user.email, user.name || '', user.image || '', role);
            
            // ポイントを初期化
            await db.prepare(`
              INSERT INTO user_points (id, user_id, balance, total_earned, total_spent, updated_at)
              VALUES (?, ?, 100, 100, 0, NOW())
            `).run(crypto.randomUUID(), newId);
            
            // ポイント履歴に記録
            await db.prepare(`
              INSERT INTO point_history (id, user_id, amount, type, description, created_at)
              VALUES (?, ?, 100, 'welcome', '新規登録ボーナス', NOW())
            `).run(crypto.randomUUID(), newId);
            
            // サブスクリプションを初期化（無料プラン）
            await db.prepare(`
              INSERT INTO subscriptions (id, user_id, plan, status, created_at, updated_at)
              VALUES (?, ?, 'free', 'active', NOW(), NOW())
            `).run(crypto.randomUUID(), newId);
            
            user.id = newId;
          }
        } catch (error) {
          console.error('Google sign in error:', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        
        // Google認証の場合、DBからroleを取得
        if (account?.provider === 'google' && user.email) {
          const role = ADMIN_EMAILS.includes(user.email) ? 'admin' : 'user';
          token.role = role;
        } else {
          token.role = (user as { role?: string }).role || 'user';
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || 'stride-secret-key-change-in-production',
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
