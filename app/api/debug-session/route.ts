import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { getToken } from 'next-auth/jwt';
import { headers, cookies } from 'next/headers';

// デバッグ用 - 本番運用後は削除すること

export async function GET(request: Request) {
  try {
    // 方法1: auth()でセッション取得
    const session = await auth();
    
    // 方法2: getTokenでJWT取得
    const headersList = await headers();
    const cookieStore = await cookies();
    
    // cookieを文字列に変換
    const cookieHeader = cookieStore.getAll()
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
    
    // NextRequestを模倣
    const mockReq = {
      headers: {
        get: (name: string) => {
          if (name === 'cookie') return cookieHeader;
          return headersList.get(name);
        }
      },
      cookies: {
        get: (name: string) => cookieStore.get(name),
        getAll: () => cookieStore.getAll(),
      }
    };

    let token = null;
    try {
      token = await getToken({ 
        req: mockReq as any,
        secret: process.env.NEXTAUTH_SECRET || 'stride-secret-key-change-in-production'
      });
    } catch (e: any) {
      console.error('getToken error:', e);
    }

    return NextResponse.json({
      session: session ? {
        user: session.user,
        expires: session.expires
      } : null,
      token: token ? {
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
        iat: token.iat,
        exp: token.exp,
      } : null,
      cookies: cookieStore.getAll().map(c => c.name),
      env: {
        hasSecret: !!process.env.NEXTAUTH_SECRET,
        hasAdminEmail: !!process.env.ADMIN_EMAIL,
        adminEmail: process.env.ADMIN_EMAIL,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}
