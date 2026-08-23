export type RealtimeEventType =
  | 'device.created'
  | 'device.updated'
  | 'device.deleted'
  | 'device.status_changed'
  | 'device.metrics_updated'
  | 'device.alerts_updated'
  | 'alert.created'
  | 'alert.acknowledged'
  | 'alert.resolved'
  | 'alert.escalated'
  | 'provisioning.started'
  | 'provisioning.progress'
  | 'provisioning.completed'
  | 'provisioning.failed'
  | 'provisioning.rolled_back'
  | 'anomaly.detected'
  | 'anomaly.feedback'
  | 'anomaly.deleted'
  | 'backup.started'
  | 'backup.completed'
  | 'backup.failed'
  | 'maintenance.started'
  | 'maintenance.ended'
  | 'dashboard.stats_updated'
  | 'connected';

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  timestamp: string;
  data: T;
  entityId?: string;
  userId?: string;
}

export interface DeviceEventData {
  id: string;
  name: string;
  ip: string;
  type: string;
  status: string;
  vendor?: string | null;
  location?: string | null;
  latestLatency?: number;
  latestPacketLoss?: number;
  lastCheck?: string;
}

export interface AlertEventData {
  id: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  assigneeId?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
}

export interface ProvisioningEventData {
  id: string;
  deviceId: string;
  deviceName: string;
  action: string;
  status: string;
  progress?: number;
  message?: string;
  errorMessage?: string;
  templateName?: string;
  executionMode: string;
  executionTimeMs?: number;
  startedAt: string;
  completedAt?: string;
}

export interface AnomalyEventData {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  severity: string;
  score: number;
  confidence: number;
  metricType: string;
  timestamp: string;
  explanation?: string;
  feedback: string;
}

export interface BackupEventData {
  id: string;
  deviceId: string;
  deviceName: string;
  status: string;
  triggerType: string;
  sizeBytes?: number;
  durationMs?: number;
  errorMessage?: string;
}

export interface MaintenanceEventData {
  id: string;
  name: string;
  deviceId?: string;
  deviceName?: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
}

export interface DashboardStatsData {
  totalDevices: number;
  upDevices: number;
  downDevices: number;
  unknownDevices: number;
  activeAlerts: number;
  criticalAlerts: number;
  totalAnomalies: number;
  activeBackups: number;
  provisioningInProgress: number;
}

export type RealtimeChannel =
  | 'devices'
  | 'devices:metrics'
  | 'devices:alerts'
  | 'alerts'
  | 'provisioning'
  | 'anomalies'
  | 'backups'
  | 'maintenance'
  | 'dashboard'
  | 'dashboard:stats';

export interface SubscriptionOptions {
  channels: RealtimeChannel[];
  filters?: {
    deviceIds?: string[];
    alertSeverities?: string[];
    anomalySeverities?: string[];
    provisioningActions?: string[];
  };
  includeDetails?: boolean;
}