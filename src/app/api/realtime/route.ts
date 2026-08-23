import { NextRequest } from 'next/server';
import { connectionManager } from '@/lib/realtime/connection-manager';
import { RealtimeChannel, SubscriptionOptions } from '@/lib/realtime/events';
import { getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { getUserFromToken } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<Response> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.realtime, 'realtime:connect', clientIp);
  if (rateLimitError) return rateLimitError;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = authHeader.slice(7);

  const user = await getUserFromToken(token);
  if (!user) {
    return new Response('Invalid token', { status: 401 });
  }

  const url = new URL(request.url);
  const channelsParam = url.searchParams.get('channels');
  const filtersParam = url.searchParams.get('filters');
  const includeDetails = url.searchParams.get('includeDetails') !== 'false';

  const channels: RealtimeChannel[] = channelsParam
    ? channelsParam.split(',').map(c => c.trim() as RealtimeChannel)
    : ['devices', 'alerts', 'anomalies', 'dashboard'];

  const filters = filtersParam ? JSON.parse(filtersParam) : {};

  const stream = new ReadableStream({
    start(controller) {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      connectionManager.addConnection(clientId, user.id, user.role, controller);

      connectionManager.subscribe(clientId, {
        channels,
        filters,
        includeDetails,
      });

      const abortSignal = AbortSignal.any([request.signal, new AbortSignal()]);
      abortSignal.addEventListener('abort', () => {
        connectionManager.removeConnection(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.realtime, 'realtime:subscribe', clientIp);
  if (rateLimitError) return rateLimitError;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = authHeader.slice(7);

  const user = await getUserFromToken(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { clientId, action, channels, filters, includeDetails } = body as {
      clientId: string;
      action: 'subscribe' | 'unsubscribe' | 'update_filters';
      channels?: RealtimeChannel[];
      filters?: SubscriptionOptions['filters'];
      includeDetails?: boolean;
    };

    if (!clientId || !action) {
      return new Response(JSON.stringify({ error: 'clientId and action are required' }), { status: 400 });
    }

    if (action === 'subscribe') {
      if (!channels || channels.length === 0) {
        return new Response(JSON.stringify({ error: 'channels required for subscribe' }), { status: 400 });
      }
      const success = connectionManager.subscribe(clientId, {
        channels,
        filters,
        includeDetails: includeDetails ?? true,
      });
      if (!success) {
        return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ success: true, subscribed: channels }));
    }

    if (action === 'unsubscribe') {
      if (!channels || channels.length === 0) {
        return new Response(JSON.stringify({ error: 'channels required for unsubscribe' }), { status: 400 });
      }
      connectionManager.unsubscribe(clientId, channels);
      return new Response(JSON.stringify({ success: true, unsubscribed: channels }));
    }

    if (action === 'update_filters') {
      const success = connectionManager.updateFilters(clientId, filters);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (error) {
    console.error('[API /api/realtime POST] Error:', error);
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }
}