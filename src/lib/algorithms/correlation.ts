/**
 * Anomaly Correlation Engine
 * Detects patterns, cascades, and correlations between anomalies across devices
 */

import { PrismaClient } from '@prisma/client';

export interface CorrelatedAnomaly {
  sourceAnomalyId: string;
  targetAnomalyId: string;
  correlation: number;        // 0-1 correlation strength
  timeDiffSeconds: number;    // Time difference
  pattern: string;            // Pattern description
  patternType: 'cascade' | 'cooccurrence' | 'periodic' | 'dependency';
}

export interface CorrelationPattern {
  id: string;
  pattern: string;            // Human-readable pattern
  devices: string[];          // Device IDs involved
  support: number;            // Frequency (0-1)
  confidence: number;         // Confidence (0-1)
  timeWindow: number;         // Typical time window in seconds
  occurrences: number;        // Total occurrences
  lastSeen: Date;
  patternType: 'cascade' | 'cooccurrence' | 'periodic' | 'dependency';
  metadata: {
    avgTimeDiff: number;
    stdTimeDiff: number;
    directionality: number;   // 0-1, how consistent the direction is
  };
}

export interface DeviceCorrelationGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    anomalyCount: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;           // Correlation strength
    pattern: string;
    avgTimeDiff: number;
    occurrences: number;
  }>;
  clusters: string[][];       // Device clusters (communities)
}

const CORRELATION_CONFIG = {
  maxTimeWindow: 30 * 60,     // 30 minutes max for correlation
  minSupport: 0.05,           // Minimum support (5%)
  minConfidence: 0.3,         // Minimum confidence (30%)
  minOccurrences: 3,          // Minimum occurrences to consider a pattern
  cascadeMaxHops: 3,          // Max hops for cascade detection
};

export class CorrelationEngine {
  private prisma: PrismaClient;
  private patterns: Map<string, CorrelationPattern> = new Map();
  private deviceGraph: DeviceCorrelationGraph | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Analyze recent anomalies and discover correlation patterns
   */
  async analyzeCorrelations(sinceHours: number = 24): Promise<{
    correlations: CorrelatedAnomaly[];
    patterns: CorrelationPattern[];
    graph: DeviceCorrelationGraph;
  }> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    // Fetch recent anomalies with device info
    const anomalies = await this.prisma.anomaly.findMany({
      where: {
        timestamp: { gte: since },
        severity: { in: ['HIGH', 'CRITICAL'] as const },
      },
      include: {
        device: { select: { id: true, name: true, ip: true, type: true } },
      },
      orderBy: { timestamp: 'asc' },
    });

    console.log(`[CorrelationEngine] Analyzing ${anomalies.length} anomalies...`);

    // 1. Find pairwise correlations
    const correlations = this.findPairwiseCorrelations(anomalies);

    // 2. Discover patterns from correlations
    const patterns = this.discoverPatterns(correlations, anomalies);

    // 3. Build device correlation graph
    const graph = this.buildDeviceGraph(correlations, anomalies);

    // 4. Store patterns in database
    await this.persistPatterns(patterns);

    this.patterns = new Map(patterns.map(p => [p.id, p]));
    this.deviceGraph = graph;

    return { correlations, patterns, graph };
  }

  /**
   * Find pairwise correlations between anomalies
   */
  private findPairwiseCorrelations(anomalies: any[]): CorrelatedAnomaly[] {
    const correlations: CorrelatedAnomaly[] = [];

    for (let i = 0; i < anomalies.length; i++) {
      const a = anomalies[i];
      for (let j = i + 1; j < anomalies.length; j++) {
        const b = anomalies[j];

        const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
        const timeDiffSec = timeDiff / 1000;

        // Only consider anomalies within time window
        if (timeDiffSec > CORRELATION_CONFIG.maxTimeWindow) {
          break; // Since sorted by time, further anomalies will be even later
        }

        // Skip same device (self-correlation)
        if (a.deviceId === b.deviceId) continue;

        // Calculate correlation features
        const correlation = this.calculateCorrelation(a, b, timeDiffSec);
        if (correlation.correlation > 0.3) {
          correlations.push(correlation);
        }
      }
    }

    return correlations;
  }

  /**
   * Calculate correlation between two anomalies
   */
  private calculateCorrelation(a: any, b: any, timeDiffSec: number): CorrelatedAnomaly {
    let correlation = 0;
    let patternType: CorrelatedAnomaly['patternType'] = 'cooccurrence';
    let pattern = '';

    // Same metric type increases correlation
    if (a.metricType === b.metricType) {
      correlation += 0.3;
      pattern += `Same metric (${a.metricType}); `;
    }

    // Same severity increases correlation
    if (a.severity === b.severity) {
      correlation += 0.2;
      pattern += `Same severity (${a.severity}); `;
    }

    // Device type relationship
    const typeA = a.device?.type || '';
    const typeB = b.device?.type || '';
    if (typeA && typeB && this.areRelatedDeviceTypes(typeA, typeB)) {
      correlation += 0.25;
      pattern += `Related types (${typeA}→${typeB}); `;
      patternType = 'dependency';
    }

    // Time proximity (closer = higher correlation)
    const timeScore = Math.max(0, 1 - timeDiffSec / CORRELATION_CONFIG.maxTimeWindow);
    correlation += timeScore * 0.25;
    pattern += `Time diff ${Math.round(timeDiffSec / 60)}min; `;

    // Determine pattern type
    if (timeDiffSec < 300 && correlation > 0.5) { // < 5 min
      patternType = 'cascade';
      pattern = `CASCADE: ${pattern}`;
    } else if (timeDiffSec < 60) { // < 1 min
      patternType = 'cooccurrence';
      pattern = `CO-OCCURRENCE: ${pattern}`;
    }

    return {
      sourceAnomalyId: a.id,
      targetAnomalyId: b.id,
      correlation: Math.min(1, correlation),
      timeDiffSeconds: timeDiffSec,
      pattern: pattern.trim(),
      patternType,
    };
  }

  /**
   * Check if two device types are typically related
   */
  private areRelatedDeviceTypes(typeA: string, typeB: string): boolean {
    const relationships: Record<string, string[]> = {
      ROUTER: ['SWITCH', 'FIREWALL', 'OLT'],
      SWITCH: ['ROUTER', 'AP', 'SERVER'],
      OLT: ['ROUTER', 'SWITCH'],
      AP: ['SWITCH', 'CONTROLLER'],
      FIREWALL: ['ROUTER', 'SWITCH'],
      SERVER: ['SWITCH', 'STORAGE'],
    };

    const related = relationships[typeA.toUpperCase()] || [];
    return related.includes(typeB.toUpperCase());
  }

  /**
   * Discover recurring patterns from correlations
   */
  private discoverPatterns(
    correlations: CorrelatedAnomaly[],
    anomalies: any[]
  ): CorrelationPattern[] {
    const patternMap = new Map<string, {
      correlations: CorrelatedAnomaly[];
      devices: Set<string>;
      timeDiffs: number[];
    }>();

    // Group correlations by pattern signature
    for (const corr of correlations) {
      const source = anomalies.find(a => a.id === corr.sourceAnomalyId);
      const target = anomalies.find(a => a.id === corr.targetAnomalyId);
      if (!source || !target) continue;

      const signature = `${source.device?.type || 'UNK'}_${source.metricType}_${target.device?.type || 'UNK'}_${target.metricType}_${corr.patternType}`;

      if (!patternMap.has(signature)) {
        patternMap.set(signature, { correlations: [], devices: new Set(), timeDiffs: [] });
      }

      const group = patternMap.get(signature)!;
      group.correlations.push(corr);
      group.devices.add(source.deviceId);
      group.devices.add(target.deviceId);
      group.timeDiffs.push(corr.timeDiffSeconds);
    }

    // Convert to patterns
    const patterns: CorrelationPattern[] = [];
    const totalAnomalies = anomalies.length;

    for (const [signature, group] of patternMap) {
      const support = group.correlations.length / totalAnomalies;
      if (support < CORRELATION_CONFIG.minSupport) continue;
      if (group.correlations.length < CORRELATION_CONFIG.minOccurrences) continue;

      const avgCorrelation = group.correlations.reduce((s, c) => s + c.correlation, 0) / group.correlations.length;
      const confidence = avgCorrelation;

      if (confidence < CORRELATION_CONFIG.minConfidence) continue;

      const timeDiffs = group.timeDiffs;
      const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
      const stdTimeDiff = Math.sqrt(
        timeDiffs.reduce((s, t) => s + Math.pow(t - avgTimeDiff, 2), 0) / timeDiffs.length
      );

      // Determine directionality (how consistent A→B is)
      const directions = group.correlations.map(c => c.timeDiffSeconds > 0 ? 1 : -1);
      const directionality = Math.abs(directions.reduce((a, b) => a + b, 0) / directions.length);

      const pattern: CorrelationPattern = {
        id: `pattern_${signature.replace(/[^a-zA-Z0-9]/g, '_')}`,
        pattern: this.generatePatternDescription(signature, group.correlations),
        devices: Array.from(group.devices),
        support,
        confidence,
        timeWindow: Math.round(avgTimeDiff),
        occurrences: group.correlations.length,
        lastSeen: new Date(Math.max(...group.correlations.map(c => {
          const a = anomalies.find(x => x.id === c.sourceAnomalyId);
          return a?.timestamp?.getTime() || 0;
        }))),
        patternType: group.correlations[0]?.patternType || 'cooccurrence',
        metadata: { avgTimeDiff, stdTimeDiff, directionality },
      };

      patterns.push(pattern);
    }

    return patterns.sort((a, b) => b.confidence * b.support - a.confidence * a.support);
  }

  /**
   * Generate human-readable pattern description
   */
  private generatePatternDescription(signature: string, correlations: CorrelatedAnomaly[]): string {
    const parts = signature.split('_');
    if (parts.length < 4) return signature;

    const [srcType, srcMetric, tgtType, tgtMetric, ptype] = parts;
    const typeMap: Record<string, string> = {
      ROUTER: 'Router',
      SWITCH: 'Switch',
      OLT: 'OLT',
      AP: 'Access Point',
      FIREWALL: 'Firewall',
      SERVER: 'Server',
    };

    const src = typeMap[srcType] || srcType;
    const tgt = typeMap[tgtType] || tgtType;
    const metric = srcMetric;

    const templates: Record<string, string> = {
      cascade: `${src} ${metric} anomaly triggers ${tgt} ${metric} anomaly within ${Math.round(correlations[0].timeDiffSeconds / 60)} min`,
      cooccurrence: `${src} and ${tgt} experience simultaneous ${metric} anomalies`,
      dependency: `${src} ${metric} degradation precedes ${tgt} ${metric} issues`,
      periodic: `${src} ${metric} anomalies occur periodically affecting ${tgt}`,
    };

    return templates[ptype] || `${src} ${metric} ↔ ${tgt} ${metric} (${ptype})`;
  }

  /**
   * Build device correlation graph for visualization
   */
  private buildDeviceGraph(correlations: CorrelatedAnomaly[], anomalies: any[]): DeviceCorrelationGraph {
    const deviceMap = new Map<string, { name: string; type: string; count: number }>();
    const edgeMap = new Map<string, { weight: number; pattern: string; timeDiffs: number[]; count: number }>();

    // Build nodes
    for (const a of anomalies) {
      if (!a.device) continue;
      const existing = deviceMap.get(a.deviceId) || { name: a.device.name, type: a.device.type, count: 0 };
      existing.count++;
      deviceMap.set(a.deviceId, existing);
    }

    // Build edges
    for (const corr of correlations) {
      const source = anomalies.find(a => a.id === corr.sourceAnomalyId);
      const target = anomalies.find(a => a.id === corr.targetAnomalyId);
      if (!source?.device || !target?.device) continue;

      const edgeKey = `${source.deviceId}→${target.deviceId}`;
      const existing = edgeMap.get(edgeKey) || { weight: 0, pattern: corr.pattern, timeDiffs: [], count: 0 };
      existing.weight += corr.correlation;
      existing.timeDiffs.push(corr.timeDiffSeconds);
      existing.count++;
      edgeMap.set(edgeKey, existing);
    }

    // Normalize edge weights
    const maxWeight = Math.max(...Array.from(edgeMap.values()).map(e => e.weight), 1);

    const nodes = Array.from(deviceMap.entries()).map(([id, v]) => ({
      id,
      label: v.name,
      type: v.type,
      anomalyCount: v.count,
    }));

    const edges = Array.from(edgeMap.entries()).map(([key, v]) => {
      const [source, target] = key.split('→');
      return {
        source,
        target,
        weight: v.weight / maxWeight,
        pattern: v.pattern,
        avgTimeDiff: v.timeDiffs.reduce((a, b) => a + b, 0) / v.timeDiffs.length,
        occurrences: v.count,
      };
    });

    // Simple clustering by device type
    const clusters = this.clusterDevices(nodes, edges);

    return { nodes, edges, clusters };
  }

  /**
   * Simple device clustering by type and connectivity
   */
  private clusterDevices(nodes: any[], edges: any[]): string[][] {
    const clusters: string[][] = [];
    const visited = new Set<string>();
    const adj = new Map<string, Set<string>>();

    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }

    for (const node of nodes) {
      if (visited.has(node.id)) continue;
      const cluster: string[] = [];
      const queue = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        cluster.push(current);
        for (const neighbor of adj.get(current) || []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Persist patterns to database
   */
  private async persistPatterns(patterns: CorrelationPattern[]): Promise<void> {
    for (const pattern of patterns) {
      try {
        await this.prisma.correlationPattern.upsert({
          where: { id: pattern.id },
          update: {
            pattern: pattern.pattern,
            devices: pattern.devices,
            support: pattern.support,
            confidence: pattern.confidence,
            timeWindow: pattern.timeWindow,
            occurrences: pattern.occurrences,
            lastSeen: pattern.lastSeen,
            patternType: pattern.patternType,
            metadata: pattern.metadata,
          },
          create: pattern,
        });
      } catch (err) {
        console.error(`[CorrelationEngine] Failed to persist pattern ${pattern.id}:`, err);
      }
    }
  }

  /**
   * Get stored patterns from database
   */
  async getStoredPatterns(): Promise<CorrelationPattern[]> {
    const stored = await this.prisma.correlationPattern.findMany({
      orderBy: { confidence: 'desc' },
      take: 50,
    });

    return stored.map(p => ({
      ...p,
      devices: p.devices as string[],
      metadata: p.metadata as CorrelationPattern['metadata'],
      lastSeen: new Date(p.lastSeen),
      patternType: p.patternType as 'cascade' | 'cooccurrence' | 'periodic' | 'dependency',
    }));
  }

  /**
   * Predict likely next anomalies based on patterns
   */
  async predictNextAnomalies(anomalyId: string): Promise<Array<{
    deviceId: string;
    deviceName: string;
    metricType: string;
    probability: number;
    expectedTimeMinutes: number;
    pattern: string;
  }>> {
    const anomaly = await this.prisma.anomaly.findUnique({
      where: { id: anomalyId },
      include: { device: true },
    });

    if (!anomaly) return [];

    const patterns = await this.getStoredPatterns();
    const predictions: Array<{
      deviceId: string;
      deviceName: string;
      metricType: string;
      probability: number;
      expectedTimeMinutes: number;
      pattern: string;
    }> = [];

    for (const pattern of patterns) {
      // Check if this anomaly matches the pattern as source
      const matches = pattern.devices.includes(anomaly.deviceId) &&
        pattern.pattern.includes(anomaly.metricType);

      if (matches) {
        // Find target devices in pattern
        for (const targetDeviceId of pattern.devices) {
          if (targetDeviceId === anomaly.deviceId) continue;

          const targetDevice = await this.prisma.device.findUnique({
            where: { id: targetDeviceId },
            select: { name: true },
          });

          if (targetDevice) {
            predictions.push({
              deviceId: targetDeviceId,
              deviceName: targetDevice.name,
              metricType: anomaly.metricType,
              probability: pattern.confidence * pattern.support,
              expectedTimeMinutes: Math.round(pattern.metadata.avgTimeDiff / 60),
              pattern: pattern.pattern,
            });
          }
        }
      }
    }

    return predictions
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
  }
}

export function createCorrelationEngine(prisma: PrismaClient): CorrelationEngine {
  return new CorrelationEngine(prisma);
}