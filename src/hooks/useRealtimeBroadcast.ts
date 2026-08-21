'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSSE, SSEStatus } from './useSSE';

interface BroadcastEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

export function useRealtimeBroadcast<T = unknown>(
  channel: 'monitoring' | 'snmp' | 'alerts' | 'workers',
  onEvent?: (event: string, data: T) => void
): { status: SSEStatus; lastEvent: BroadcastEvent<T> | null } {
  const [lastEvent, setLastEvent] = useState<BroadcastEvent<T> | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const handleSSEEvent = useCallback(
    (eventName: string, data: unknown) => {
      const broadcastEvent: BroadcastEvent<T> = {
        type: eventName,
        payload: data as T,
        timestamp: new Date().toISOString(),
      };
      setLastEvent(broadcastEvent);
      onEventRef.current?.(eventName, data as T);
    },
    []
  );

  const { status } = useSSE({
    url: `/api/realtime/${channel}`,
    enabled: true,
    onEvent: handleSSEEvent,
  });

  return { status, lastEvent };
}
