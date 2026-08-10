export const DEVICE_TYPES = {
  ROUTER: 'Router',
  SWITCH: 'Switch',
  OLT: 'OLT',
  ONT: 'ONT',
  FIREWALL: 'Firewall',
  SERVER: 'Server',
  OTHER: 'Other',
} as const;

export const DEVICE_STATUS = {
  UP: 'Up',
  DOWN: 'Down',
  UNKNOWN: 'Unknown',
  MAINTENANCE: 'Maintenance',
} as const;

export const ALERT_SEVERITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
} as const;

export const DEFAULT_PING_TIMEOUT = 5000;
export const DEFAULT_SNMP_TIMEOUT = 5000;
export const DEFAULT_SSH_TIMEOUT = 10000;

export const METRICS_RETENTION_DAYS = 30;
export const ANOMALY_THRESHOLD = 0.7;
