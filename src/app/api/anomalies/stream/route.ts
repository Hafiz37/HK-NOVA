import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastCheck = Date.now();
      let isClosed = false;

      const sendEvent = (data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      sendEvent({ type: "connected", timestamp: new Date().toISOString() });

      const pingInterval = setInterval(() => {
        if (!isClosed) {
          sendEvent({ type: "ping", timestamp: new Date().toISOString() });
        }
      }, 30000);

      const pollInterval = setInterval(async () => {
        if (isClosed) return;

        try {
          const since = new Date(lastCheck);
          const anomalies = await prisma.anomaly.findMany({
            where: {
              timestamp: { gt: since },
              severity: { in: ["HIGH", "CRITICAL"] as const },
            },
            include: {
              device: { select: { id: true, name: true, ip: true, type: true } },
            },
            orderBy: { timestamp: "desc" },
            take: 20,
          });

          if (anomalies.length > 0) {
            lastCheck = Date.now();
            const formatted = anomalies.map((a) => ({
              id: a.id,
              deviceId: a.deviceId,
              device: a.device,
              metricType: a.metricType,
              anomalyScore: a.anomalyScore,
              severity: a.severity,
              timestamp: a.timestamp.toISOString(),
              confidence: a.confidence,
            }));
            sendEvent({ type: "anomalies", data: formatted });
          }
        } catch (err) {
          console.error("[SSE Anomalies] Poll error:", err);
          if (!isClosed) {
            sendEvent({ type: "error", message: "Poll failed" });
          }
        }
      }, 5000);

      request.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(pingInterval);
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // Ignore
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}