import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateUserSecurityReport } from '@/lib/security/timeline';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const report = await generateUserSecurityReport(auth.user.id);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Security report error:', error);
    return NextResponse.json({ error: 'Failed to generate security report' }, { status: 500 });
  }
}