/**
 * GraphQL Schema for HK-NOVA
 * Provides flexible queries for dashboard data
 */

import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLError } from 'graphql';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { DeviceType, DeviceStatus, AlertSeverity, AlertStatus } from '@prisma/client';

type AnnotationInputType = {
  deviceId?: string;
  timestamp: string;
  type: string;
  title: string;
  description?: string;
  severity?: string;
  tags?: string[];
};

const typeDefs = `#graphql
  scalar JSON

  type Device {
    id: ID!
    name: String!
    ip: String!
    type: String!
    vendor: String
    model: String
    location: String
    status: String!
    isDemo: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type DeviceMetrics {
    device: Device!
    metricType: String!
    period: Period!
    summary: MetricSummary!
    data: [MetricPoint!]!
  }

  type MetricPoint {
    timestamp: String!
    latency: Float
    packetLoss: Float
    cpuUtil: Float
    memUtil: Float
  }

  type MetricSummary {
    avgLatency: Float
    maxLatency: Float
    minLatency: Float
    avgPacketLoss: Float
    avgCpuUtil: Float
    maxCpuUtil: Float
    avgMemUtil: Float
    maxMemUtil: Float
    dataPoints: Int!
    returnedPoints: Int
  }

  type Alert {
    id: ID!
    type: String!
    severity: String!
    message: String!
    status: String!
    createdAt: String!
    acknowledgedAt: String
    resolvedAt: String
    device: Device
    assignee: User
  }

  type User {
    id: ID!
    username: String!
    fullName: String
    email: String
    role: String!
    lastLoginAt: String
  }

  type MonitoringSummary {
    devices: DeviceStats!
    alerts: AlertStats!
    avgLatencyMs: Float
    updatedAt: String!
  }

  type DeviceStats {
    total: Int!
    up: Int!
    down: Int!
    unknown: Int!
    maintenance: Int!
  }

  type AlertStats {
    active: Int!
    bySeverity: JSON
  }

  type WorkerStatus {
    id: ID!
    name: String!
    type: String!
    status: String!
    lastHeartbeat: String
    uptimeSeconds: Int
    health: WorkerHealth
    detail: String!
    command: String!
  }

  type WorkerHealth {
    expectedCycles: Int!
    actualCycles: Int!
    missedCycles: Int!
    avgCycleDurationMs: Float
    lastCycleDurationMs: Float
    lagSeconds: Float
    healthScore: Int
    queueDepth: Int
    queueBackend: String
  }

  type CorrelationResult {
    metricA: String!
    metricB: String!
    correlation: Float!
    pValue: Float!
    sampleSize: Int!
    interpretation: String!
  }

  type ForecastResult {
    device: Device!
    metric: String!
    currentValue: Float!
    trend: TrendInfo!
    capacityWarning: CapacityWarning!
    forecast: [ForecastPoint!]!
  }

  type TrendInfo {
    direction: String!
    slopePerDay: Float!
    confidenceR2: Float!
  }

  type CapacityWarning {
    daysToWarningThreshold: Int
    daysToCriticalThreshold: Int
    warningThreshold: Float!
    criticalThreshold: Float!
  }

  type ForecastPoint {
    timestamp: String!
    predictedValue: Float!
  }

  type PlatformHealth {
    status: String!
    timestamp: String!
    process: ProcessInfo!
    system: SystemInfo!
    cache: CacheInfo!
    telemetry: TelemetryInfo!
  }

  type ProcessInfo {
    uptimeSeconds: Int!
    memory: MemoryInfo!
  }

  type MemoryInfo {
    heapUsedMb: Float!
    heapTotalMb: Float!
    rssMb: Float!
  }

  type SystemInfo {
    platform: String!
    arch: String!
    cpuCores: Int!
    cpuModel: String!
    loadAvg: [Float!]!
    memory: SystemMemoryInfo!
  }

  type SystemMemoryInfo {
    totalMb: Float!
    freeMb: Float!
    usedPct: Float!
  }

  type CacheInfo {
    backend: String!
    connected: Boolean!
    keys: Int!
  }

  type TelemetryInfo {
    totalRequests: Int!
    avgLatencyMs: Float!
    p95LatencyMs: Float!
    errorCount: Int!
  }

  type Period {
    hours: Int!
    since: String!
  }

  type Trend {
    direction: String!
    slopePerDay: Float!
    confidenceR2: Float!
  }

  input MetricsInput {
    deviceId: ID!
    metricType: String
    hours: Int
    limit: Int
  }

  input AlertsInput {
    status: String
    severity: String
    deviceId: ID
    page: Int
    pageSize: Int
  }

  type Query {
    # Device queries
    device(id: ID!): Device
    devices(
      status: String
      type: String
      vendor: String
      search: String
      page: Int
      pageSize: Int
    ): [Device!]!

    # Metrics queries
    deviceMetrics(input: MetricsInput!): DeviceMetrics
    monitoringSummary: MonitoringSummary!

    # Alert queries
    alerts(input: AlertsInput): [Alert!]!
    alert(id: ID!): Alert

    # Worker queries
    workerStatus: [WorkerStatus!]!

    # Correlation queries
    correlations(deviceId: ID, hours: Int): [CorrelationResult!]!

    # Forecast queries
    forecast(deviceId: ID!, metric: String!, days: Int): ForecastResult

    # Platform health
    platformHealth: PlatformHealth

    # Current user
    me: User
  }

  type Mutation {
    acknowledgeAlert(id: ID!): Alert
    resolveAlert(id: ID!): Alert
    createAnnotation(input: AnnotationInput!): Annotation
    addComment(annotationId: ID!, content: String!): Comment
  }

  input AnnotationInput {
    deviceId: ID
    timestamp: String!
    type: String!
    title: String!
    description: String
    severity: String
    tags: [String!]
  }

  type Annotation {
    id: ID!
    deviceId: String
    authorId: ID!
    authorName: String!
    timestamp: String!
    type: String!
    title: String!
    description: String
    severity: String
    tags: [String!]
    createdAt: String!
    updatedAt: String!
  }

  type Comment {
    id: ID!
    annotationId: ID!
    authorId: ID!
    authorName: String!
    content: String!
    createdAt: String!
    updatedAt: String!
  }
`;

const resolvers = {
  Query: {
    device: async (_: unknown, { id }: { id: string }, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      return prisma.device.findUnique({ where: { id, deletedAt: null } });
    },

    devices: async (
      _: unknown,
      args: { status?: string; type?: string; vendor?: string; search?: string; page?: number; pageSize?: number },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');

      const where: { deletedAt: null; status?: DeviceStatus; type?: DeviceType; vendor?: string; OR?: Array<{ name: { contains: string; mode: 'insensitive' } } | { ip: { contains: string } }> } = { deletedAt: null };
      if (args.status) where.status = args.status as DeviceStatus;
      if (args.type) where.type = args.type as DeviceType;
      if (args.vendor) where.vendor = args.vendor;
      if (args.search) {
        where.OR = [
          { name: { contains: args.search, mode: 'insensitive' } },
          { ip: { contains: args.search } },
        ];
      }

      return prisma.device.findMany({
        where,
        skip: (args.page ?? 1 - 1) * (args.pageSize ?? 20),
        take: args.pageSize ?? 20,
        orderBy: { name: 'asc' },
      });
    },

    deviceMetrics: async (
      _: unknown,
      { input }: { input: { deviceId: string; metricType?: string; hours?: number; limit?: number } },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');

      const device = await prisma.device.findUnique({ where: { id: input.deviceId, deletedAt: null } });
      if (!device) throw new GraphQLError('Device not found');

      const hours = input.hours ?? 24;
      const limit = input.limit ?? 300;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const [icmpMetrics, snmpMetrics] = await Promise.all([
        prisma.metric.findMany({
          where: { deviceId: input.deviceId, metricType: 'ICMP', timestamp: { gte: since } },
          select: { id: true, timestamp: true, latency: true, packetLoss: true },
          orderBy: { timestamp: 'asc' },
        }),
        prisma.metric.findMany({
          where: { deviceId: input.deviceId, metricType: 'SNMP', timestamp: { gte: since } },
          select: { id: true, timestamp: true, cpuUtil: true, memUtil: true },
          orderBy: { timestamp: 'asc' },
        }),
      ]);

      // Downsample if needed (simplified - use LTTB in production)
      const downsample = <T>(data: T[], maxPoints: number): T[] => {
        if (data.length <= maxPoints) return data;
        const step = Math.ceil(data.length / maxPoints);
        return data.filter((_, i) => i % step === 0);
      };

      return {
        device,
        metricType: input.metricType ?? 'ALL',
        period: { hours, since: since.toISOString() },
        summary: {
          avgLatency: icmpMetrics.length ? icmpMetrics.reduce((s, m) => s + (m.latency ?? 0), 0) / icmpMetrics.filter(m => m.latency != null).length : null,
          maxLatency: icmpMetrics.length ? Math.max(...icmpMetrics.map(m => m.latency ?? 0)) : null,
          minLatency: icmpMetrics.length ? Math.min(...icmpMetrics.map(m => m.latency ?? 0)) : null,
          avgPacketLoss: icmpMetrics.length ? icmpMetrics.reduce((s, m) => s + (m.packetLoss ?? 0), 0) / icmpMetrics.filter(m => m.packetLoss != null).length : null,
          avgCpuUtil: snmpMetrics.length ? snmpMetrics.reduce((s, m) => s + (m.cpuUtil ?? 0), 0) / snmpMetrics.filter(m => m.cpuUtil != null).length : null,
          maxCpuUtil: snmpMetrics.length ? Math.max(...snmpMetrics.map(m => m.cpuUtil ?? 0)) : null,
          avgMemUtil: snmpMetrics.length ? snmpMetrics.reduce((s, m) => s + (m.memUtil ?? 0), 0) / snmpMetrics.filter(m => m.memUtil != null).length : null,
          maxMemUtil: snmpMetrics.length ? Math.max(...snmpMetrics.map(m => m.memUtil ?? 0)) : null,
          dataPoints: icmpMetrics.length + snmpMetrics.length,
          returnedPoints: downsample(icmpMetrics, limit).length + downsample(snmpMetrics, limit).length,
        },
        data: [
          ...downsample(icmpMetrics, limit).map(m => ({
            timestamp: m.timestamp.toISOString(),
            latency: m.latency,
            packetLoss: m.packetLoss,
            cpuUtil: null,
            memUtil: null,
          })),
          ...downsample(snmpMetrics, limit).map(m => ({
            timestamp: m.timestamp.toISOString(),
            latency: null,
            packetLoss: null,
            cpuUtil: m.cpuUtil,
            memUtil: m.memUtil,
          })),
        ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
      };
    },

    monitoringSummary: async (_: unknown, __: unknown, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');

      const [totalDevices, upDevices, downDevices, unknownDevices, activeAlerts, recentMetrics] = await Promise.all([
        prisma.device.count({ where: { deletedAt: null } }),
        prisma.device.count({ where: { deletedAt: null, status: 'UP' } }),
        prisma.device.count({ where: { deletedAt: null, status: 'DOWN' } }),
        prisma.device.count({ where: { deletedAt: null, status: 'UNKNOWN' } }),
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

      const alertsBySeverity = await prisma.alert.groupBy({
        by: ['severity'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
      });

      return {
        devices: {
          total: totalDevices,
          up: upDevices,
          down: downDevices,
          unknown: unknownDevices,
          maintenance: totalDevices - upDevices - downDevices - unknownDevices,
        },
        alerts: {
          active: activeAlerts,
          bySeverity: Object.fromEntries(alertsBySeverity.map((a) => [a.severity, a._count.id])),
        },
        avgLatencyMs: recentMetrics[0]?.avgLatency ?? null,
        updatedAt: new Date().toISOString(),
      };
    },

    alerts: async (
      _: unknown,
      { input }: { input?: { status?: string; severity?: string; deviceId?: string; page?: number; pageSize?: number } },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');

      const where: { status?: AlertStatus; severity?: AlertSeverity; deviceId?: string } = {};
      if (input?.status) where.status = input.status as AlertStatus;
      if (input?.severity) where.severity = input.severity as AlertSeverity;
      if (input?.deviceId) where.deviceId = input.deviceId;

      return prisma.alert.findMany({
        where,
        include: { device: true, assignee: true },
        skip: (input?.page ?? 1 - 1) * (input?.pageSize ?? 20),
        take: input?.pageSize ?? 20,
        orderBy: { createdAt: 'desc' },
      });
    },

    alert: async (_: unknown, { id }: { id: string }, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      return prisma.alert.findUnique({ where: { id }, include: { device: true, assignee: true } });
    },

    workerStatus: async (_: unknown, __: unknown, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      // Reuse existing worker status logic
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/workers/status`, {
        headers: { cookie: (context.auth as { session?: { cookie: string } }).session?.cookie || '' },
      });
      const data = await res.json();
      return data.workers;
    },

    correlations: async (
      _: unknown,
      { deviceId, hours }: { deviceId?: string; hours?: number },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      const { analyzeCorrelations } = await import('@/lib/correlation');
      return analyzeCorrelations({ deviceId, windowHours: hours ?? 24 });
    },

    forecast: async (
      _: unknown,
      { deviceId, metric, days }: { deviceId: string; metric: string; days?: number },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');

      const device = await prisma.device.findUnique({ where: { id: deviceId, deletedAt: null } });
      if (!device) throw new GraphQLError('Device not found');

      // Simplified forecast - would use the full forecast API in production
      return {
        device,
        metric,
        currentValue: 0,
        trend: { direction: 'STABLE', slopePerDay: 0, confidenceR2: 0 },
        capacityWarning: { daysToWarningThreshold: null, daysToCriticalThreshold: null, warningThreshold: 85, criticalThreshold: 95 },
        forecast: [],
      };
    },

    platformHealth: async (_: unknown, __: unknown, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/platform/health`);
      return res.json();
    },

    me: async (_: unknown, __: unknown, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      return context.auth.user;
    },
  },

  Mutation: {
    acknowledgeAlert: async (_: unknown, { id }: { id: string }, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/alerts/${id}/acknowledge`, {
        method: 'POST',
      });
      return res.json();
    },

    resolveAlert: async (_: unknown, { id }: { id: string }, context: { auth: Awaited<ReturnType<typeof requireSession>> }) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/alerts/${id}/resolve`, {
        method: 'POST',
      });
      return res.json();
    },

    createAnnotation: async (
      _: unknown,
      { input }: { input: { deviceId?: string; timestamp: string; type: string; title: string; description?: string; severity?: string; tags?: string[] } },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      const { createAnnotation } = await import('@/lib/annotations');
      return createAnnotation(context.auth.user.id, context.auth.user.fullName || context.auth.user.username, {
        deviceId: input.deviceId,
        timestamp: new Date(input.timestamp),
        type: input.type as 'INCIDENT' | 'MAINTENANCE' | 'DEPLOYMENT' | 'CONFIG_CHANGE' | 'NOTE',
        title: input.title,
        description: input.description,
        severity: input.severity as 'INFO' | 'WARNING' | 'CRITICAL' | undefined,
        tags: input.tags,
      });
    },

    addComment: async (
      _: unknown,
      { annotationId, content }: { annotationId: string; content: string },
      context: { auth: Awaited<ReturnType<typeof requireSession>> }
    ) => {
      if (!context.auth.ok) throw new GraphQLError('Unauthorized');
      const { addComment } = await import('@/lib/annotations');
      return addComment(annotationId, context.auth.user.id, context.auth.user.fullName || context.auth.user.username, content);
    },
  },
};

export const graphqlSchema = makeExecutableSchema({
  typeDefs,
  resolvers,
});