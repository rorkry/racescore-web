import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // NextAuth.js v5のcookie名に対応
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'stride-secret-key-change-in-production',
    cookieName: process.env.NODE_ENV === 'production' 
      ? '__Secure-authjs.session-token' 
      : 'authjs.session-token',
  });
  
  // /admin ルートの保護（管理者のみ）
  if (pathname.startsWith('/admin')) {
    if (!token || token.role !== 'admin') {
      return NextResponse.redirect(new URL('/?unauthorized=true', req.url));
    }
  }
  
  // レースカード・マイページはログイン必須
  if (
    pathname.startsWith('/race') ||
    pathname.startsWith('/card') ||
    pathname.startsWith('/mypage') ||
    pathname.startsWith('/ranking')
  ) {
    if (!token) {
      // 未ログインの場合はトップページにリダイレクト
      return NextResponse.redirect(new URL('/?login_required=true', req.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // 保護するルート
    '/admin/:path*',
    '/race/:path*',
    '/races/:path*',
    '/card/:path*',
    '/mypage/:path*',
    '/ranking/:path*',
  ],
};
