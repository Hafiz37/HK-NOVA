import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { searchBackups, searchLatestConfigs, getSearchSuggestions } from '@/lib/backup-search';

/**
 * GET /api/backups/search
 * Search config content across backups
 * 
 * Query params:
 * - q: search query (required)
 * - deviceIds: comma-separated device IDs
 * - deviceTypes: comma-separated device types (ROUTER, SWITCH, etc.)
 * - vendors: comma-separated vendors
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - limit: max results (default 50)
 * - offset: pagination offset (default 0)
 * - caseSensitive: boolean (default false)
 * - useRegex: boolean (default false)
 * - latestOnly: boolean - search only latest backup per device (default false)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const deviceIds = searchParams.get('deviceIds')?.split(',').filter(Boolean);
    const deviceTypes = searchParams.get('deviceTypes')?.split(',').filter(Boolean);
    const vendors = searchParams.get('vendors')?.split(',').filter(Boolean);
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const caseSensitive = searchParams.get('caseSensitive') === 'true';
    const useRegex = searchParams.get('useRegex') === 'true';
    const latestOnly = searchParams.get('latestOnly') === 'true';

    let result;
    if (latestOnly) {
      result = await searchLatestConfigs(prisma, {
        query,
        deviceIds,
        deviceTypes,
        vendors,
        limit,
        caseSensitive,
        useRegex,
      });
    } else {
      result = await searchBackups(prisma, {
        query,
        deviceIds,
        deviceTypes,
        vendors,
        startDate,
        endDate,
        limit,
        offset,
        caseSensitive,
        useRegex,
      });
    }

    return NextResponse.json({
      data: result.results,
      stats: result.stats,
      suggestions: getSearchSuggestions(),
    });
  } catch (error) {
    console.error('[API /api/backups/search] Error:', error);
    return NextResponse.json({ error: 'Failed to search backups' }, { status: 500 });
  }
}