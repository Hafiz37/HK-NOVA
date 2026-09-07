import { NextRequest, NextResponse } from 'next/server';
import { getDeviceQueueMetrics } from '@/lib/device-operation-queue';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('deviceId');

    if (deviceId) {
      const metrics = getDeviceQueueMetrics(deviceId);
      if (!metrics) {
        return NextResponse.json(
          { error: 'Device not found in queue' },
          { status: 404 }
        );
      }
      return NextResponse.json({ deviceId, metrics });
    }

    const allMetrics = getDeviceQueueMetrics();
    const metricsArray = Array.from(allMetrics as Map<string, unknown>).map(([id, metrics]) => ({
      deviceId: id,
      metrics,
    }));

    return NextResponse.json({
      total: metricsArray.length,
      devices: metricsArray,
    });
  } catch (error) {
    console.error('Failed to get queue metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
