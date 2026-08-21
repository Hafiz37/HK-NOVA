import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { calculateBackupHealth } from '@/lib/backup-health';

/**
 * GET /api/backups/health
 * Returns backup system health score and metrics
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const health = await calculateBackupHealth(prisma);
    return NextResponse.json({ data: health });
  } catch (error) {
    console.error('[API /api/backups/health] Error:', error);
    return NextResponse.json({ error: 'Failed to calculate backup health' }, { status: 500 });
  }
}