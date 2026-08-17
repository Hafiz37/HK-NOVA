'use client';

import { useEffect, useRef, useState } from 'react';

export type SSEStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  maxReconnectDelayMs?: number;
  onEvent?: (eventName: string, data: unknown) => void;
}

export function useSSE({
  url,
  enabled = true,
  maxReconnectDelayMs = 30_000,
  onEvent,
}: UseSSEOptions): { status: SSEStatus } {
  const [status, setStatus] = useState<SSEStatus>(enabled ? 'connecting' : 'disconnected');
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => setStatus('disconnected'));
      return;
    }

    let cancelled = false;
    let retryCount = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(1000 * Math.pow(2, retryCount), maxReconnectDelayMs);
      retryCount += 1;
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (cancelled) return;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      setStatus('connecting');

      try {
        const res = await fetch(url, {
          signal,
          headers: { Accept: 'text/event-stream' },
          credentials: 'include',
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            if (!cancelled) setStatus('error');
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) throw new Error('No response body');

        if (!cancelled) {
          setStatus('connected');
          retryCount = 0;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventName = 'message';
            let eventData = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) eventData += line.slice(5).trim() + '\n';
            }
            eventData = eventData.trim();
            if (!eventData) continue;
            try {
              onEventRef.current?.(eventName, JSON.parse(eventData));
            } catch {
              onEventRef.current?.(eventName, eventData);
            }
          }
        }

        if (!cancelled && !signal.aborted) {
          setStatus('disconnected');
          scheduleReconnect();
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('error');
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      controller?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [enabled, url, maxReconnectDelayMs]);

  return { status };
}

export function useRealtimeSnmp(
  onUpdate: (data: unknown) => void,
  enabled = true
) {
  return useSSE({
    url: '/api/realtime/snmp',
    enabled,
    onEvent: (event, data) => {
      if (event === 'snmp-update') onUpdate(data);
    },
  });
}

export function useRealtimeMonitoring(
  onUpdate: (data: unknown) => void,
  enabled = true
) {
  return useSSE({
    url: '/api/realtime/monitoring',
    enabled,
    onEvent: (event, data) => {
      if (event === 'monitoring-update') onUpdate(data);
    },
  });
}
