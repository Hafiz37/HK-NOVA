import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { diffTexts, diffStats } from '@/lib/diff';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/backups/[id]
 * Returns one backup snapshot, its full config content, and a diff vs the
 * previous snapshot of the same device (when available).
 */
export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const backup = await prisma.backup.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, name: true, ip: true, type: true, vendor: true } },
      },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    const previous = await prisma.backup.findFirst({
      where: { deviceId: backup.deviceId, timestamp: { lt: backup.timestamp } },
      orderBy: { timestamp: 'desc' },
      select: { id: true, configHash: true, timestamp: true },
    });

    const diff = previous ? diffTexts(previous ? await loadPrevContent(previous.id) : '', backup.configContent) : null;

    return NextResponse.json({
      data: {
        id: backup.id,
        timestamp: backup.timestamp,
        configHash: backup.configHash,
        configContent: backup.configContent,
        changeDetected: backup.changeDetected,
        status: backup.status,
        errorMessage: backup.errorMessage,
        device: backup.device,
      },
      previous: previous ?? null,
      diff:
        diff
          ? {
              lines: diff,
              stats: diffStats(diff),
            }
          : null,
    });
  } catch (error) {
    console.error('[API /api/backups/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch backup' }, { status: 500 });
  }
}

async function loadPrevContent(id: string): Promise<string> {
  const row = await prisma.backup.findUnique({ where: { id }, select: { configContent: true } });
  return row?.configContent ?? '';
}