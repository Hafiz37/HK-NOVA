import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';

const COOKIE_NAME = 'hk_nova_session';
const MAX_AGE_SEC = 60 * 60 * 12; // 12 hours

function getSecret(): string {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.JWT_SECRET &&
    !process.env.ENCRYPTION_KEY
  ) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-insecure-secret';
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  fullName?: string;
}

export interface SessionPayload {
  u: string;      // username
  n?: string;     // fullName
  exp: number;    // expiration
}

export type AuthResult =
  | { ok: false; response: NextResponse }
  | { ok: true; user: AuthUser };

/**
 * Validates the session and (optionally) a role requirement.
 * Returns the authenticated user on success, or a NextResponse (401/403) to return.
 */
export async function requireAuth(roles?: UserRole[]): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { username: session.username },
    select: { id: true, username: true, role: true, fullName: true },
  });

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 }) };
  }

  return { ok: true, user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName ?? undefined } };
}

/** Requires any authenticated session. */
export function requireSession(): Promise<AuthResult> {
  return requireAuth();
}

/** Requires an authenticated session with one of the given roles. */
export function requireRole(roles: UserRole[]): Promise<AuthResult> {
  return requireAuth(roles);
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function createSessionToken(username: string, fullName?: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const body = Buffer.from(JSON.stringify({ u: username, n: fullName, exp }), 'utf8').toString('base64url');
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): { username: string; fullName?: string } | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = sign(body);
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.u || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: parsed.u, fullName: parsed.n };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ username: string; fullName?: string } | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SEC,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
}

export { COOKIE_NAME, MAX_AGE_SEC };
