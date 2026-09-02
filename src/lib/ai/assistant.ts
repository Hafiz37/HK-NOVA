/**
 * AI Assistant / Natural Language Query Interface
 * Parses natural language queries and executes them against the GraphQL API
 */

import prisma from '@/lib/prisma';
import { DeviceStatus, AlertSeverity, AlertStatus } from '@prisma/client';

interface ParsedQuery {
  intent: 'devices' | 'metrics' | 'alerts' | 'forecast' | 'correlation' | 'summary' | 'unknown';
  entities: {
    deviceName?: string;
    deviceIp?: string;
    metric?: string;
    timeRange?: { hours: number };
    status?: string;
    severity?: string;
    limit?: number;
  };
  confidence: number;
}

interface QueryResult {
  type: 'table' | 'chart' | 'summary' | 'text';
  data: unknown;
  explanation: string;
  suggestedFollowUp?: string[];
}

// Intent patterns
const INTENT_PATTERNS = [
  {
    intent: 'devices',
    patterns: [
      /(show|list|display|get)\s+(all\s+)?devices?/i,
      /(which|what)\s+devices?/i,
      /devices?\s+(with|that|where)/i,
    ],
  },
  {
    intent: 'metrics',
    patterns: [
      /(show|display|get|plot|graph)\s+(metrics?|latency|cpu|memory|bandwidth)/i,
      /(how is|what is)\s+(the\s+)?(latency|cpu|memory)/i,
      /metrics?\s+for\s+/i,
    ],
  },
  {
    intent: 'alerts',
    patterns: [
      /(show|list|display|get)\s+(all\s+)?alerts?/i,
      /(which|what)\s+alerts?/i,
      /alerts?\s+(with|that|where)/i,
      /active\s+alerts?/i,
    ],
  },
  {
    intent: 'forecast',
    patterns: [
      /(predict|forecast|projection)\s+/i,
      /(when will|estimate|projected)\s+/i,
      /capacity\s+(planning|forecast)/i,
    ],
  },
  {
    intent: 'correlation',
    patterns: [
      /(correlat|relationship|dependen)/i,
      /(why is|what caused|root cause)/i,
    ],
  },
  {
    intent: 'summary',
    patterns: [
      /(summary|overview|dashboard|status)\s+/i,
      /how\s+(is\s+)?(the\s+)?(network|system)/i,
    ],
  },
];

// Entity extraction patterns
const ENTITY_PATTERNS = {
  deviceName: [
    /device\s+(?:named?|called?)\s+["']?([a-zA-Z0-9\-_]+)["']?/i,
    /for\s+["']?([a-zA-Z0-9\-_]+)["']?/i,
  ],
  deviceIp: [
    /(?:ip|address)\s+(?:is\s+)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i,
    /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i,
  ],
  metric: [
    /(latency|packet\s*loss|cpu|memory|mem|bandwidth|throughput|in|out)\b/i,
  ],
  timeRange: [
    /(last|past|previous)\s+(\d+)\s*(hour|hr|minute|min|day|week)s?/i,
    /last\s+(24h|1h|6h|7d)/i,
  ],
  status: [
    /\b(up|down|unknown|maintenance)\b/i,
  ],
  severity: [
    /\b(critical|high|medium|low)\b/i,
  ],
  limit: [
    /(top|first|limit)\s+(\d+)/i,
  ],
};

export function parseNaturalLanguage(query: string): ParsedQuery {
  const lowerQuery = query.toLowerCase().trim();

  // Detect intent
  let bestIntent: ParsedQuery['intent'] = 'unknown';
  let bestConfidence = 0;

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = lowerQuery.match(pattern);
      if (match) {
        const confidence = match[0].length / lowerQuery.length;
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestIntent = intent as ParsedQuery['intent'];
        }
      }
    }
  }

  // Extract entities
  const entities: ParsedQuery['entities'] = {};

  // Device name
  for (const pattern of ENTITY_PATTERNS.deviceName) {
    const match = query.match(pattern);
    if (match) {
      entities.deviceName = match[1];
      break;
    }
  }

  // Device IP
  for (const pattern of ENTITY_PATTERNS.deviceIp) {
    const match = query.match(pattern);
    if (match) {
      entities.deviceIp = match[1];
      break;
    }
  }

  // Metric
  for (const pattern of ENTITY_PATTERNS.metric) {
    const match = query.match(pattern);
    if (match) {
      const metric = match[1].toLowerCase();
      entities.metric = normalizeMetric(metric);
      break;
    }
  }

  // Time range
  for (const pattern of ENTITY_PATTERNS.timeRange) {
    const match = query.match(pattern);
    if (match) {
      let hours = 24;
      if (match[2]) {
        const value = parseInt(match[2], 10);
        const unit = match[3]?.toLowerCase();
        if (unit?.startsWith('h')) hours = value;
        else if (unit?.startsWith('d')) hours = value * 24;
        else if (unit?.startsWith('w')) hours = value * 24 * 7;
        else if (unit?.startsWith('min')) hours = value / 60;
      } else if (match[1]?.match(/^\d+[hd]$/i)) {
        const val = match[1];
        hours = parseInt(val, 10) * (val.endsWith('d') ? 24 : 1);
      }
      entities.timeRange = { hours };
      break;
    }
  }

  // Status
  for (const pattern of ENTITY_PATTERNS.status) {
    const match = query.match(pattern);
    if (match) {
      entities.status = match[1].toUpperCase();
      break;
    }
  }

  // Severity
  for (const pattern of ENTITY_PATTERNS.severity) {
    const match = query.match(pattern);
    if (match) {
      entities.severity = match[1].toUpperCase();
      break;
    }
  }

  // Limit
  for (const pattern of ENTITY_PATTERNS.limit) {
    const match = query.match(pattern);
    if (match) {
      entities.limit = parseInt(match[2], 10);
      break;
    }
  }

  return {
    intent: bestIntent,
    entities,
    confidence: bestConfidence,
  };
}

function normalizeMetric(metric: string): string {
  const mapping: Record<string, string> = {
    latency: 'latency',
    'packet loss': 'packetLoss',
    packetloss: 'packetLoss',
    cpu: 'cpuUtil',
    memory: 'memUtil',
    mem: 'memUtil',
    bandwidth: 'bandwidth',
    throughput: 'bandwidth',
    in: 'inBps',
    out: 'outBps',
  };
  return mapping[metric] || metric;
}

export async function executeQuery(
  parsed: ParsedQuery,
  userId: string
): Promise<QueryResult> {
  switch (parsed.intent) {
    case 'devices':
      return executeDevicesQuery(parsed.entities);
    case 'metrics':
      return executeMetricsQuery(parsed.entities);
    case 'alerts':
      return executeAlertsQuery(parsed.entities);
    case 'forecast':
      return executeForecastQuery(parsed.entities);
    case 'correlation':
      return executeCorrelationQuery(parsed.entities);
    case 'summary':
      return executeSummaryQuery();
    default:
      return {
        type: 'text',
        data: null,
        explanation: "I couldn't understand your query. Try asking about devices, metrics, alerts, or forecasts.",
        suggestedFollowUp: [
          'Show all devices',
          'Show alerts for the last 24 hours',
          'Show CPU metrics for device router-core-1',
          'Forecast memory for device switch-01',
        ],
      };
  }
}

async function executeDevicesQuery(entities: ParsedQuery['entities']): Promise<QueryResult> {
  const where: { deletedAt: null; name?: { contains: string; mode: 'insensitive' }; ip?: string; status?: DeviceStatus } = { deletedAt: null };

  if (entities.deviceName) {
    where.name = { contains: entities.deviceName, mode: 'insensitive' };
  }
  if (entities.deviceIp) {
    where.ip = entities.deviceIp;
  }
  if (entities.status) {
    where.status = entities.status as DeviceStatus;
  }

  const devices = await prisma.device.findMany({
    where,
    take: entities.limit ?? 50,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      ip: true,
      type: true,
      vendor: true,
      status: true,
      location: true,
    },
  });

  return {
    type: 'table',
    data: devices,
    explanation: `Found ${devices.length} device${devices.length !== 1 ? 's' : ''}`,
    suggestedFollowUp: devices.length > 0
      ? [`Show metrics for ${devices[0].name}`, `Show alerts for ${devices[0].name}`]
      : ['Add a new device'],
  };
}

async function executeMetricsQuery(entities: ParsedQuery['entities']): Promise<QueryResult> {
  let deviceId: string | null = null;

  if (entities.deviceName) {
    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const device = devices.find(d => d.name.toLowerCase().includes(entities.deviceName!.toLowerCase()));
    deviceId = device?.id ?? null;
  } else if (entities.deviceIp) {
    const device = await prisma.device.findUnique({
      where: { ip: entities.deviceIp, deletedAt: null },
      select: { id: true },
    });
    deviceId = device?.id ?? null;
  }

  if (!deviceId) {
    return {
      type: 'text',
      data: null,
      explanation: 'Please specify a device name or IP address to show metrics.',
      suggestedFollowUp: ['Show metrics for router-core-1', 'Show latency for 10.0.0.1'],
    };
  }

  const hours = entities.timeRange?.hours ?? 24;
  const metricType = entities.metric === 'latency' || entities.metric === 'packetLoss' ? 'ICMP' : 'SNMP';

  const metrics = await prisma.metric.findMany({
    where: {
      deviceId,
      metricType: entities.metric && (entities.metric === 'latency' || entities.metric === 'packetLoss') ? 'ICMP' : 'SNMP',
      timestamp: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
    },
    select: { timestamp: true, latency: true, packetLoss: true, cpuUtil: true, memUtil: true },
    orderBy: { timestamp: 'asc' },
    take: 300,
  });

  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { name: true, ip: true } });

  return {
    type: 'chart',
    data: { device, metrics, hours, metric: entities.metric },
    explanation: `Showing ${metrics.length} data points for ${device?.name} (${device?.ip}) over ${hours}h`,
    suggestedFollowUp: ['Show alerts for this device', 'Compare with baseline'],
  };
}

async function executeAlertsQuery(entities: ParsedQuery['entities']): Promise<QueryResult> {
  const where: { status?: AlertStatus; severity?: AlertSeverity; deviceId?: string } = {};

  if (entities.status) where.status = entities.status as AlertStatus;
  if (entities.severity) where.severity = entities.severity as AlertSeverity;
  if (entities.deviceName) {
    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const device = devices.find(d => d.name.toLowerCase().includes(entities.deviceName!.toLowerCase()));
    if (device) where.deviceId = device.id;
  }

  const alerts = await prisma.alert.findMany({
    where,
    take: entities.limit ?? 50,
    orderBy: { createdAt: 'desc' },
    include: { device: { select: { name: true, ip: true } } },
  });

  return {
    type: 'table',
    data: alerts,
    explanation: `Found ${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`,
    suggestedFollowUp: alerts.length > 0
      ? [`Acknowledge alert ${alerts[0].id}`, `Show metrics for device ${(alerts[0] as { device?: { name?: string } }).device?.name}`]
      : ['No active alerts'],
  };
}

async function executeForecastQuery(entities: ParsedQuery['entities']): Promise<QueryResult> {
  let deviceId: string | null = null;

  if (entities.deviceName) {
    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const device = devices.find(d => d.name.toLowerCase().includes(entities.deviceName!.toLowerCase()));
    deviceId = device?.id ?? null;
  }

  if (!deviceId) {
    return {
      type: 'text',
      data: null,
      explanation: 'Please specify a device to forecast.',
      suggestedFollowUp: ['Forecast CPU for router-core-1'],
    };
  }

  return {
    type: 'text',
    data: { deviceId, metric: entities.metric ?? 'cpu', days: 7 },
    explanation: `Forecast request for ${entities.metric ?? 'CPU'} on device. Use the Forecast API for detailed predictions.`,
    suggestedFollowUp: ['Show current metrics for this device'],
  };
}

async function executeCorrelationQuery(entities: ParsedQuery['entities']): Promise<QueryResult> {
  return {
    type: 'text',
    data: null,
    explanation: 'Correlation analysis available via API. Use /api/monitoring/correlations endpoint.',
    suggestedFollowUp: ['Show correlation between CPU and latency'],
  };
}

async function executeSummaryQuery(): Promise<QueryResult> {
  const [totalDevices, upDevices, downDevices, activeAlerts, recentMetrics] = await Promise.all([
    prisma.device.count({ where: { deletedAt: null } }),
    prisma.device.count({ where: { deletedAt: null, status: 'UP' } }),
    prisma.device.count({ where: { deletedAt: null, status: 'DOWN' } }),
    prisma.alert.count({ where: { status: 'ACTIVE' } }),
    prisma.$queryRaw<Array<{ avgLatency: number | null }>>`
      SELECT AVG(m.latency) as avgLatency
      FROM Metric m
      INNER JOIN (
        SELECT deviceId, MAX(timestamp) as maxTs
        FROM Metric WHERE metricType = 'ICMP' AND latency IS NOT NULL GROUP BY deviceId
      ) latest ON m.deviceId = latest.deviceId AND m.timestamp = latest.maxTs
      WHERE m.metricType = 'ICMP' AND m.latency IS NOT NULL
    `,
  ]);

  return {
    type: 'summary',
    data: {
      devices: { total: totalDevices, up: upDevices, down: downDevices },
      alerts: { active: activeAlerts },
      avgLatency: recentMetrics[0]?.avgLatency ?? null,
    },
    explanation: `System Overview: ${totalDevices} devices (${upDevices} UP, ${downDevices} DOWN), ${activeAlerts} active alerts`,
    suggestedFollowUp: ['Show down devices', 'Show critical alerts'],
  };
}

// Example queries for documentation
export const EXAMPLE_QUERIES = [
  'Show all devices',
  'Show devices with status DOWN',
  'Show metrics for router-core-1',
  'Show latency for 10.0.0.1 last 6 hours',
  'Show CPU for switch-01',
  'Show active alerts',
  'Show critical alerts for the last 24 hours',
  'Show alerts for router-core-1',
  'Forecast memory for device core-router for 7 days',
  'What is the system status?',
  'Show summary',
];