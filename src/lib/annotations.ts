/**
 * Annotations & Comments System
 * Timeline markers, collaborative notes, and change log overlay for charts.
 */

import prisma from '@/lib/prisma';

interface SettingValue {
  [key: string]: unknown;
}

export interface Annotation {
  id: string;
  deviceId: string | null;
  authorId: string;
  authorName: string;
  timestamp: Date;
  type: 'INCIDENT' | 'MAINTENANCE' | 'DEPLOYMENT' | 'CONFIG_CHANGE' | 'NOTE';
  title: string;
  description?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  annotationId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

function parseJsonValue(value: unknown): SettingValue {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as SettingValue;
  }
  return {};
}

function toDate(value: unknown): Date {
  if (typeof value === 'string') return new Date(value);
  if (value instanceof Date) return value;
  return new Date();
}

/**
 * Create a new annotation
 */
export async function createAnnotation(
  authorId: string,
  authorName: string,
  input: {
    deviceId?: string;
    timestamp: Date;
    type: Annotation['type'];
    title: string;
    description?: string;
    severity?: Annotation['severity'];
    tags?: string[];
  }
): Promise<Annotation> {
  const annotation = await prisma.setting.upsert({
    where: { key: `annotation:${crypto.randomUUID()}` },
    create: {
      key: `annotation:${crypto.randomUUID()}`,
      value: {
        ...input,
        authorId,
        authorName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    update: {
      value: {
        ...input,
        authorId,
        authorName,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  const value = parseJsonValue(annotation.value);

  return {
    id: annotation.key.replace('annotation:', ''),
    deviceId: (value.deviceId as string) ?? null,
    authorId: value.authorId as string,
    authorName: value.authorName as string,
    timestamp: new Date(input.timestamp),
    type: value.type as Annotation['type'],
    title: value.title as string,
    description: value.description as string | undefined,
    severity: value.severity as Annotation['severity'] | undefined,
    tags: value.tags as string[] | undefined,
    createdAt: toDate(value.createdAt),
    updatedAt: toDate(value.updatedAt),
  };
}

/**
 * Get annotations for a device or all devices in time range
 */
export async function getAnnotations(
  options: {
    deviceId?: string;
    startTime?: Date;
    endTime?: Date;
    type?: Annotation['type'];
    limit?: number;
  } = {}
): Promise<Annotation[]> {
  const { deviceId, startTime, endTime, type, limit = 100 } = options;

  const settings = await prisma.setting.findMany({
    where: {
      key: { startsWith: 'annotation:' },
    },
    take: limit * 2,
    orderBy: { updatedAt: 'desc' },
  });

  return settings
    .map((s) => {
      const value = parseJsonValue(s.value);
      if (!value.timestamp) return null;

      const annotation: Annotation = {
        id: s.key.replace('annotation:', ''),
        deviceId: value.deviceId as string | null,
        authorId: value.authorId as string,
        authorName: value.authorName as string,
        timestamp: toDate(value.timestamp),
        type: value.type as Annotation['type'],
        title: value.title as string,
        description: value.description as string | undefined,
        severity: value.severity as Annotation['severity'] | undefined,
        tags: value.tags as string[] | undefined,
        createdAt: toDate(value.createdAt),
        updatedAt: toDate(value.updatedAt),
      };

      // Filter
      if (deviceId && annotation.deviceId !== deviceId) return null;
      if (startTime && annotation.timestamp < startTime) return null;
      if (endTime && annotation.timestamp > endTime) return null;
      if (type && annotation.type !== type) return null;

      return annotation;
    })
    .filter((a): a is Annotation => a !== null)
    .slice(0, limit);
}

/**
 * Add comment to annotation
 */
export async function addComment(
  annotationId: string,
  authorId: string,
  authorName: string,
  content: string
): Promise<Comment> {
  const commentKey = `comment:${annotationId}:${crypto.randomUUID()}`;
  const comment = await prisma.setting.create({
    data: {
      key: commentKey,
      value: {
        annotationId,
        authorId,
        authorName,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  });

  const value = parseJsonValue(comment.value);

  return {
    id: comment.key.replace(`comment:${annotationId}:`, ''),
    annotationId,
    authorId: value.authorId as string,
    authorName: value.authorName as string,
    content: value.content as string,
    createdAt: toDate(value.createdAt),
    updatedAt: toDate(value.updatedAt),
  };
}

/**
 * Get comments for an annotation
 */
export async function getComments(annotationId: string): Promise<Comment[]> {
  const settings = await prisma.setting.findMany({
    where: {
      key: { startsWith: `comment:${annotationId}:` },
    },
    orderBy: { updatedAt: 'asc' },
  });

  return settings.map((s) => {
    const value = parseJsonValue(s.value);
    return {
      id: s.key.replace(`comment:${annotationId}:`, ''),
      annotationId,
      authorId: value.authorId as string,
      authorName: value.authorName as string,
      content: value.content as string,
      createdAt: toDate(value.createdAt),
      updatedAt: toDate(value.updatedAt),
    };
  });
}

/**
 * Auto-create annotation from alert
 */
export async function createAnnotationFromAlert(
  alert: { id: string; deviceId: string | null; type: string; severity: string; message: string; createdAt: Date },
  authorId: string = 'system',
  authorName: string = 'Alert Engine'
): Promise<Annotation> {
  const severityMap: Record<string, Annotation['severity']> = {
    CRITICAL: 'CRITICAL',
    HIGH: 'WARNING',
    MEDIUM: 'WARNING',
    LOW: 'INFO',
  };

  return createAnnotation(authorId, authorName, {
    deviceId: alert.deviceId ?? undefined,
    timestamp: alert.createdAt,
    type: 'INCIDENT',
    title: `Alert: ${alert.type}`,
    description: alert.message,
    severity: severityMap[alert.severity] ?? 'INFO',
    tags: ['auto-generated', 'alert'],
  });
}

/**
 * Auto-create annotation from maintenance window
 */
export async function createAnnotationFromMaintenance(
  window: { id: string; name: string; deviceId: string | null; startAt: Date; endAt: Date; reason?: string }
): Promise<Annotation> {
  return createAnnotation('system', 'Maintenance Scheduler', {
    deviceId: window.deviceId ?? undefined,
    timestamp: window.startAt,
    type: 'MAINTENANCE',
    title: `Maintenance: ${window.name}`,
    description: window.reason,
    severity: 'INFO',
    tags: ['auto-generated', 'maintenance'],
  });
}

/**
 * Convert annotations to chart reference lines
 */
export function annotationsToChartOverlays(
  annotations: Annotation[],
  timeRange: { start: number; end: number }
): Array<{
  x: Date | string;
  label: string;
  color: string;
  data: Annotation;
}> {
  const colorMap: Record<Annotation['type'], string> = {
    INCIDENT: '#ef4444',
    MAINTENANCE: '#f59e0b',
    DEPLOYMENT: '#3b82f6',
    CONFIG_CHANGE: '#8b5cf6',
    NOTE: '#64748b',
  };

  return annotations
    .filter((a) => a.timestamp.getTime() >= timeRange.start && a.timestamp.getTime() <= timeRange.end)
    .map((a) => ({
      x: a.timestamp,
      label: a.title,
      color: a.severity === 'CRITICAL' ? '#ef4444' : colorMap[a.type],
      data: a,
    }));
}