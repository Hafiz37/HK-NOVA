import { connectionManager } from './connection-manager';
import { RealtimeEvent, RealtimeEventType, DeviceEventData, AlertEventData, ProvisioningEventData, AnomalyEventData, BackupEventData, MaintenanceEventData, DashboardStatsData } from './events';

export class RealtimeEmitter {
  static emit<T>(type: RealtimeEventType, data: T, entityId?: string, userId?: string): number {
    const event: RealtimeEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      data,
      entityId,
      userId,
    };
    return connectionManager.broadcast(event);
  }

  static deviceCreated(data: DeviceEventData, userId?: string): number {
    return this.emit('device.created', data, data.id, userId);
  }

  static deviceUpdated(data: DeviceEventData, userId?: string): number {
    return this.emit('device.updated', data, data.id, userId);
  }

  static deviceDeleted(id: string, userId?: string): number {
    return this.emit('device.deleted', { id }, id, userId);
  }

  static deviceStatusChanged(data: DeviceEventData, userId?: string): number {
    return this.emit('device.status_changed', data, data.id, userId);
  }

  static deviceMetricsUpdated(data: DeviceEventData, userId?: string): number {
    return this.emit('device.metrics_updated', data, data.id, userId);
  }

  static deviceAlertsUpdated(data: DeviceEventData & { activeAlerts: any[] }, userId?: string): number {
    return this.emit('device.alerts_updated', data, data.id, userId);
  }

  static alertCreated(data: AlertEventData, userId?: string): number {
    return this.emit('alert.created', data, data.id, userId);
  }

  static alertAcknowledged(data: AlertEventData, userId?: string): number {
    return this.emit('alert.acknowledged', data, data.id, userId);
  }

  static alertResolved(data: AlertEventData, userId?: string): number {
    return this.emit('alert.resolved', data, data.id, userId);
  }

  static alertEscalated(data: AlertEventData, userId?: string): number {
    return this.emit('alert.escalated', data, data.id, userId);
  }

  static provisioningStarted(data: ProvisioningEventData, userId?: string): number {
    return this.emit('provisioning.started', data, data.id, userId);
  }

  static provisioningProgress(data: ProvisioningEventData, userId?: string): number {
    return this.emit('provisioning.progress', data, data.id, userId);
  }

  static provisioningCompleted(data: ProvisioningEventData, userId?: string): number {
    return this.emit('provisioning.completed', data, data.id, userId);
  }

  static provisioningFailed(data: ProvisioningEventData, userId?: string): number {
    return this.emit('provisioning.failed', data, data.id, userId);
  }

  static provisioningRolledBack(data: ProvisioningEventData, userId?: string): number {
    return this.emit('provisioning.rolled_back', data, data.id, userId);
  }

  static anomalyDetected(data: AnomalyEventData, userId?: string): number {
    return this.emit('anomaly.detected', data, data.id, userId);
  }

  static anomalyFeedback(data: AnomalyEventData & { feedback: string }, userId?: string): number {
    return this.emit('anomaly.feedback', data, data.id, userId);
  }

  static anomalyDeleted(id: string, userId?: string): number {
    return this.emit('anomaly.deleted', { id }, id, userId);
  }

  static backupStarted(data: BackupEventData, userId?: string): number {
    return this.emit('backup.started', data, data.id, userId);
  }

  static backupCompleted(data: BackupEventData, userId?: string): number {
    return this.emit('backup.completed', data, data.id, userId);
  }

  static backupFailed(data: BackupEventData, userId?: string): number {
    return this.emit('backup.failed', data, data.id, userId);
  }

  static maintenanceStarted(data: MaintenanceEventData, userId?: string): number {
    return this.emit('maintenance.started', data, data.id, userId);
  }

  static maintenanceEnded(data: MaintenanceEventData, userId?: string): number {
    return this.emit('maintenance.ended', data, data.id, userId);
  }

  static dashboardStatsUpdated(data: DashboardStatsData): number {
    return this.emit('dashboard.stats_updated', data);
  }
}