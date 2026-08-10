export interface Metric {
  id: string;
  deviceId: string;
  timestamp: Date;
  metricType: string;
  latency?: number;
  packetLoss?: number;
  cpuUtil?: number;
  memUtil?: number;
  interfaceData?: InterfaceData[];
}

export interface InterfaceData {
  index: number;
  name: string;
  alias?: string;
  operStatus: number;
  adminStatus: number;
  speed: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inDiscards: number;
  outDiscards: number;
  bpsIn?: number;
  bpsOut?: number;
  utilization?: number;
}

export interface MetricSummary {
  avgLatency: number;
  maxLatency: number;
  minLatency: number;
  avgPacketLoss: number;
  uptime: number;
}
