import { NextResponse } from 'next/server';
import { clearSessionCookieOptions } from '@/lib/auth';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ message: 'Logout berhasil' });
  response.cookies.set(clearSessionCookieOptions());
  return response;
}
