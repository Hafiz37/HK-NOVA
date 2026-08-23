import { PrismaClient } from '@prisma/client';

export const ADVANCED_FEATURE_NAMES = [
  // 1-5: Base metrics
  'latency',
  'cpu',
  'memory',
  'ifInOctets',
  'ifOutOctets',

  // 6-11: Temporal features
  'hourOfDay',        // 0-23
  'dayOfWeek',        // 0-6
  'isWeekend',        // 0 or 1
  'isBusinessHours',  // 0 or 1 (8-18)
  'isNightTime',      // 0 or 1 (22-6)
  'monthOfYear',      // 1-12

  // 12-16: Rate of change (delta vs previous window)
  'latencyDelta',
  'cpuDelta',
  'memoryDelta',
  'inOctetsDelta',
  'outOctetsDelta',

  // 17-26: Rolling statistics (15m & 1h)
  'latencyMean15m',
  'latencyStd15m',
  'cpuMean1h',
  'cpuStd1h',
  'memoryMean1h',
  'memoryStd1h',
  'inOctetsMean15m',
  'outOctetsMean15m',
  'latencyMax15m',
  'latencyMin15m',

  // 27-31: Network health & quality metrics
  'packetLossRate',
  'errorRate',
  'bandwidthUtilization',
  'jitter',
  'availability',

  // 32-33: Device context
  'deviceTypeEncoded',
  'locationEncoded',
];

export interface ExtractedVector {
  timestamp: Date;
  features: number[];
}

const DEVICE_TYPE_MAP: Record<string, number> = {
  ROUTER: 1,
  SWITCH: 2,
  OLT: 3,
  AP: 4,
  SERVER: 5,
};

function hashString(str: string | null | undefined): number {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

export async function extractAdvancedFeatures(
  prisma: PrismaClient,
  deviceId: string,
  days: number = 7
): Promise<{ vectors: ExtractedVector[]; featureNames: string[] }> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { type: true, location: true },
  });

  const deviceTypeEnc = DEVICE_TYPE_MAP[device?.type?.toUpperCase() ?? ''] ?? 0;
  const locationEnc = hashString(device?.location);

  const metrics = await prisma.metric.findMany({
    where: {
      deviceId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'asc' },
  });

  if (metrics.length === 0) {
    return { vectors: [], featureNames: ADVANCED_FEATURE_NAMES };
  }

  // Group metrics into 5-minute buckets
  const BUCKET_MS = 5 * 60 * 1000;
  const grouped = new Map<number, {
    timestamp: Date;
    latency: number | null;
    cpu: number | null;
    memory: number | null;
    inOctets: number | null;
    outOctets: number | null;
    packetLoss: number | null;
    errors: number | null;
  }>();

  for (const m of metrics) {
    const bucketStartMs = Math.floor(m.timestamp.getTime() / BUCKET_MS) * BUCKET_MS;
    if (!grouped.has(bucketStartMs)) {
      grouped.set(bucketStartMs, {
        timestamp: new Date(bucketStartMs),
        latency: null,
        cpu: null,
        memory: null,
        inOctets: null,
        outOctets: null,
        packetLoss: null,
        errors: null,
      });
    }

    const entry = grouped.get(bucketStartMs)!;
    const mt = m.metricType?.toLowerCase();

    if (mt === 'icmp') {
      if (m.latency != null && entry.latency == null) entry.latency = m.latency;
      if (m.packetLoss != null && entry.packetLoss == null) entry.packetLoss = m.packetLoss;
    }

    if (mt === 'snmp') {
      if (m.cpuUtil != null) entry.cpu = m.cpuUtil;
      if (m.memUtil != null) entry.memory = m.memUtil;

      const ifaces = Array.isArray(m.interfaceData) ? m.interfaceData : [];
      const inVals = (ifaces as Array<{ inOctets?: number }>).map((i) => i.inOctets).filter((v): v is number => typeof v === 'number');
      const outVals = (ifaces as Array<{ outOctets?: number }>).map((i) => i.outOctets).filter((v): v is number => typeof v === 'number');
      const errVals = (ifaces as Array<{ inErrors?: number; outErrors?: number }>).flatMap((i) => [(i.inErrors ?? 0), (i.outErrors ?? 0)]);

      if (inVals.length > 0) entry.inOctets = inVals.reduce((a, b) => a + b, 0);
      if (outVals.length > 0) entry.outOctets = outVals.reduce((a, b) => a + b, 0);
      if (errVals.length > 0) entry.errors = errVals.reduce((a, b) => a + b, 0);
    }
  }

  const sortedBuckets = Array.from(grouped.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const vectors: ExtractedVector[] = [];

  for (let i = 0; i < sortedBuckets.length; i++) {
    const curr = sortedBuckets[i];
    const prev = i > 0 ? sortedBuckets[i - 1] : null;

    const lat = curr.latency ?? 0;
    const cpu = curr.cpu ?? 0;
    const mem = curr.memory ?? 0;
    const inOct = curr.inOctets ?? 0;
    const outOct = curr.outOctets ?? 0;

    // Temporal
    const ts = curr.timestamp;
    const hour = ts.getHours();
    const day = ts.getDay();
    const isWeekend = day === 0 || day === 6 ? 1 : 0;
    const isBizHours = hour >= 8 && hour <= 18 ? 1 : 0;
    const isNight = hour >= 22 || hour < 6 ? 1 : 0;
    const month = ts.getMonth() + 1;

    // Deltas
    const latDelta = prev ? lat - (prev.latency ?? 0) : 0;
    const cpuDelta = prev ? cpu - (prev.cpu ?? 0) : 0;
    const memDelta = prev ? mem - (prev.memory ?? 0) : 0;
    const inOctDelta = prev ? inOct - (prev.inOctets ?? 0) : 0;
    const outOctDelta = prev ? outOct - (prev.outOctets ?? 0) : 0;

    // Rolling windows (look back up to 12 buckets = 1h)
    const window1h = sortedBuckets.slice(Math.max(0, i - 11), i + 1);
    const window15m = sortedBuckets.slice(Math.max(0, i - 2), i + 1);

    const lats15m = window15m.map((w) => w.latency ?? 0);
    const cpus1h = window1h.map((w) => w.cpu ?? 0);
    const mems1h = window1h.map((w) => w.memory ?? 0);
    const inOcts15m = window15m.map((w) => w.inOctets ?? 0);
    const outOcts15m = window15m.map((w) => w.outOctets ?? 0);

    const latMean15m = lats15m.reduce((a, b) => a + b, 0) / (lats15m.length || 1);
    const latStd15m = Math.sqrt(lats15m.reduce((s, v) => s + Math.pow(v - latMean15m, 2), 0) / (lats15m.length || 1));
    const cpuMean1h = cpus1h.reduce((a, b) => a + b, 0) / (cpus1h.length || 1);
    const cpuStd1h = Math.sqrt(cpus1h.reduce((s, v) => s + Math.pow(v - cpuMean1h, 2), 0) / (cpus1h.length || 1));
    const memMean1h = mems1h.reduce((a, b) => a + b, 0) / (mems1h.length || 1);
    const memStd1h = Math.sqrt(mems1h.reduce((s, v) => s + Math.pow(v - memMean1h, 2), 0) / (mems1h.length || 1));
    const inMean15m = inOcts15m.reduce((a, b) => a + b, 0) / (inOcts15m.length || 1);
    const outMean15m = outOcts15m.reduce((a, b) => a + b, 0) / (outOcts15m.length || 1);
    const latMax15m = Math.max(...lats15m, 0);
    const latMin15m = Math.min(...lats15m, 0);

    // Network metrics
    const pktLoss = curr.packetLoss ?? 0;
    const errRate = curr.errors ?? 0;
    const bwUtil = Math.min(100, ((inOct + outOct) / (100 * 1024 * 1024)) * 100); // normalized against baseline
    const jitter = Math.abs(latDelta);
    const avail = lat > 0 || cpu > 0 ? 1 : 0;

    const featureRow = [
      lat, cpu, mem, inOct, outOct,
      hour, day, isWeekend, isBizHours, isNight, month,
      latDelta, cpuDelta, memDelta, inOctDelta, outOctDelta,
      latMean15m, latStd15m, cpuMean1h, cpuStd1h, memMean1h, memStd1h, inMean15m, outMean15m, latMax15m, latMin15m,
      pktLoss, errRate, bwUtil, jitter, avail,
      deviceTypeEnc, locationEnc,
    ];

    vectors.push({ timestamp: curr.timestamp, features: featureRow });
  }

  return { vectors, featureNames: ADVANCED_FEATURE_NAMES };
}
