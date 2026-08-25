"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AnomalyEvent {
  id: string;
  deviceId: string;
  device: { id: string; name: string; ip: string; type: string } | null;
  metricType: string;
  anomalyScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  timestamp: string;
  confidence?: number;
}

interface AnomalyStreamEvent {
  type: "connected" | "ping" | "anomalies" | "error";
  data?: AnomalyEvent[];
  timestamp?: string;
  message?: string;
}

interface UseAnomalyStreamOptions {
  onNewAnomalies?: (anomalies: AnomalyEvent[]) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
  filterSeverity?: Array<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">;
}

export function useAnomalyStream(options: UseAnomalyStreamOptions = {}) {
  const { onNewAnomalies, onError, enabled = true, filterSeverity = ["HIGH", "CRITICAL"] } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<AnomalyStreamEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || eventSourceRef.current) return;

    try {
      const es = new EventSource("/api/anomalies/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data: AnomalyStreamEvent = JSON.parse(event.data);
          setLastEvent(data);

          if (data.type === "anomalies" && data.data) {
            const filtered = data.data.filter((a) => filterSeverity.includes(a.severity));
            if (filtered.length > 0 && onNewAnomalies) {
              onNewAnomalies(filtered);
            }
          }
        } catch (err) {
          console.error("[useAnomalyStream] Parse error:", err);
        }
      };

      es.onerror = (err) => {
        setConnected(false);
        const errorMsg = "SSE connection error";
        console.error("[useAnomalyStream] Connection error:", err);
        if (onError) onError(errorMsg);

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            eventSourceRef.current = null;
            connect();
          }, delay);
        }
      };
    } catch (err) {
      console.error("[useAnomalyStream] Failed to create EventSource:", err);
    }
  }, [enabled, filterSeverity, onNewAnomalies, onError, disconnect]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  return { connected, lastEvent, connect, disconnect };
}

// Toast notification hook
export function useAnomalyToasts() {
  const [toasts, setToasts] = useState<Array<{ id: string; anomaly: AnomalyEvent; read: boolean }>>([]);

  const handleNewAnomalies = useCallback((anomalies: AnomalyEvent[]) => {
    setToasts((prev) => [
      ...anomalies.map((a) => ({ id: a.id, anomaly: a, read: false })),
      ...prev,
    ].slice(0, 20)); // Keep max 20 toasts
  }, []);

  const markRead = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, read: true } : t)));
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const unreadCount = toasts.filter((t) => !t.read).length;

  return { toasts, unreadCount, handleNewAnomalies, markRead, dismiss };
}