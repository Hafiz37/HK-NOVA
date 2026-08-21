"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number | string;
  height?: number;
}

export default function Sparkline({
  data,
  color = "#3b82f6",
  width = "100%",
  height = 28,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div className="h-7 w-full bg-slate-800/40 rounded animate-pulse" />;
  }

  const chartData = data.map((val, idx) => ({ idx, val }));
  const gradientId = `sparkline-grad-${color.replace("#", "")}`;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="idx" hide />
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const val = payload[0]?.value;
                return (
                  <div className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-white font-mono shadow">
                    {typeof val === "number" ? val.toFixed(1) : val}
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="val"
            stroke={color}
            strokeWidth={1.5}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
