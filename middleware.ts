import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // /admin ルートの保護
  if (pathname.startsWith('/admin')) {
    // NextAuth.js v5のcookie名に対応
    const token = await getToken({ 
      req, 
      secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'stride-secret-key-change-in-production',
      cookieName: process.env.NODE_ENV === 'production' 
        ? '__Secure-authjs.session-token' 
        : 'authjs.session-token',
    });
    
    // 未ログインまたは管理者でない場合
    if (!token || token.role !== 'admin') {
      // ホームにリダイレクト
      return NextResponse.redirect(new URL('/?unauthorized=true', req.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // 保護するルート
    '/admin/:path*',
  ],
};
