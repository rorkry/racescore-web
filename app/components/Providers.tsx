'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// セッション型
interface User {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: 'user' | 'admin';
}

interface Session {
  user?: User;
  expires: string;
}

interface SessionContextValue {
  data: Session | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  update: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: 'loading',
  update: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export async function signOut(options?: { callbackUrl?: string }) {
  // CSRFトークンを取得
  const csrfRes = await fetch('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();
  
  await fetch('/api/auth/signout', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken }),
  });
  window.location.href = options?.callbackUrl || '/';
}

export async function signIn(
  provider: string,
  options?: { email?: string; password?: string; callbackUrl?: string; redirect?: boolean }
): Promise<{ error?: string } | undefined> {
  if (provider === 'credentials') {
    try {
      // CSRFトークンを取得
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      
      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrfToken,
          email: options?.email || '',
          password: options?.password || '',
        }),
      });
      
      // NextAuth.js のレスポンスを確認
      const url = new URL(res.url);
      if (url.searchParams.has('error')) {
        return { error: 'CredentialsSignin' };
      }
      
      if (options?.redirect !== false) {
        window.location.href = options?.callbackUrl || '/';
      }
      
      return res.ok ? undefined : { error: 'CredentialsSignin' };
    } catch {
      return { error: 'CredentialsSignin' };
    }
  } else {
    // OAuthプロバイダー（Google, Twitter, LINE, Apple）
    // CSRFトークンを取得
    const csrfRes = await fetch('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    
    const callbackUrl = encodeURIComponent(options?.callbackUrl || '/');
    window.location.href = `/api/auth/signin/${provider}?csrfToken=${csrfToken}&callbackUrl=${callbackUrl}`;
    return undefined;
  }
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setSession(data);
          setStatus('authenticated');
        } else {
          setSession(null);
          setStatus('unauthenticated');
        }
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    } catch {
      setSession(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return (
    <SessionContext.Provider value={{ data: session, status, update: fetchSession }}>
      {children}
    </SessionContext.Provider>
  );
}
