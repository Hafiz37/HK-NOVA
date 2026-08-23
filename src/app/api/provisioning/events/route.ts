import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';

const encoder = new TextEncoder();

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  filters: {
    type?: 'batch' | 'scheduled' | 'all';
    deviceId?: string;
  };
}

const clients = new Map<string, SSEClient>();

function addClient(id: string, controller: ReadableStreamDefaultController, filters: SSEClient['filters']) {
  clients.set(id, { id, controller, filters });
}

function removeClient(id: string) {
  clients.delete(id);
}

function broadcast(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const buffer = encoder.encode(message);

  for (const client of clients.values()) {
    try {
      client.controller.enqueue(buffer);
    } catch {
      clients.delete(client.id);
    }
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') as 'batch' | 'scheduled' | 'all' | null;
  const deviceId = searchParams.get('deviceId') || undefined;

  const stream = new ReadableStream({
    start(controller) {
      const clientId = crypto.randomUUID();
      addClient(clientId, controller, { type: type ?? 'all', deviceId });

      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`));

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
          removeClient(clientId);
        }
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        removeClient(clientId);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export function broadcastBatchUpdate(batchId: string, data: {
  status: string;
  successCount: number;
  failedCount: number;
  totalItems: number;
  deviceId: string;
}) {
  broadcast('batch_update', { batchId, ...data });
}

export function broadcastScheduledUpdate(jobId: string, data: {
  status: string;
  executedAt?: string;
  logId?: string;
  deviceId: string;
}) {
  broadcast('scheduled_update', { jobId, ...data });
}

export function broadcastProvisioningUpdate(logId: string, data: {
  status: string;
  executionMode?: string;
  executionTimeMs?: number;
  deviceId: string;
  ontSerial?: string;
}) {
  broadcast('provisioning_update', { logId, ...data });
}

export { clients };