import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'hk_nova_session';

async function getSecretKey(): Promise<CryptoKey> {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.JWT_SECRET &&
    !process.env.ENCRYPTION_KEY
  ) {
    throw new Error('JWT_SECRET must be set in production');
  }
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-insecure-secret';
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;

  try {
    const key = await getSecretKey();
    const enc = new TextEncoder();
    const sigBytes = new Uint8Array(
      sig.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body));
    if (!ok) return false;

    const parsed = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
          c.charCodeAt(0)
        )
      )
    ) as { u?: string; exp?: number };

    if (!parsed.u || !parsed.exp) return false;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const authed = await verifyToken(token);

  if (pathname.startsWith('/dashboard') && !authed) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && authed) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
