import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // /admin ルートの保護
  if (pathname.startsWith('/admin')) {
    // JWTトークンからセッション情報を取得（Edgeランタイム互換）
    const token = await getToken({ 
      req, 
      secret: process.env.NEXTAUTH_SECRET || 'stride-secret-key-change-in-production'
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
