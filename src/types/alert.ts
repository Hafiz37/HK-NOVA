export interface Alert {
  id: string;
  type: AlertType;
  deviceId?: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

export type AlertType =
  | 'DEVICE_DOWN'
  | 'HIGH_UTILIZATION'
  | 'ANOMALY_DETECTED'
  | 'BACKUP_FAILED'
  | 'PROVISIONING_FAILED';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED';
