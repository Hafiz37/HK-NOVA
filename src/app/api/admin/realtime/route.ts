import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/realtime/connection-manager';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { success, InternalServerError } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const connections = connectionManager.getConnectionInfo();
    const channelStats = connectionManager.getChannelStats();
    const totalConnections = connectionManager.getConnectionCount();

    return NextResponse.json(success({
      totalConnections,
      connections,
      channelStats,
    }));
  } catch (err) {
    console.error('[API /api/admin/realtime GET] Error:', err);
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { action, clientId, broadcast } = body;

    if (action === 'disconnect' && clientId) {
      connectionManager.removeConnection(clientId);
      return NextResponse.json(success({ message: `Client ${clientId} disconnected` }));
    }

    if (action === 'broadcast' && broadcast) {
      const { type, data, entityId, userId } = broadcast;
      const sent = connectionManager.broadcast({
        type,
        timestamp: new Date().toISOString(),
        data,
        entityId,
        userId,
      });
      return NextResponse.json(success({ message: `Broadcast sent to ${sent} clients` }));
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/admin/realtime POST] Error:', err);
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}