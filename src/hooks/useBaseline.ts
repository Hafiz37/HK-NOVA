"use client";

import { useCallback, useEffect, useState } from "react";

export type BaselineField = "latency" | "packetLoss" | "cpu" | "mem";
export type DeviationLevel = "NORMAL" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";

export interface BaselineStats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  p95: number;
  count: number;
}

export interface BaselineData {
  baseline: BaselineStats;
  insufficientData: boolean;
  current: number | null;
  deviation: { score: number | null; level: DeviationLevel };
  window: { hours: number; since: string };
}

/** Fetch baseline per device + field dari API. */
export function useBaseline(
  deviceId: string | null,
  field: BaselineField,
  hours = 24
) {
  const [data, setData] = useState<BaselineData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBaseline = useCallback(async () => {
    if (!deviceId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/devices/${deviceId}/baseline?field=${field}&hours=${hours}`
      );
      if (res.ok) setData((await res.json()) as BaselineData);
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId, field, hours]);

  useEffect(() => {
    const run = async () => { await fetchBaseline(); };
    void run();
  }, [fetchBaseline]);

  return { data, loading, refresh: fetchBaseline };
}