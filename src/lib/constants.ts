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

// ICMP Worker constants
export const ICMP_BATCH_SIZE = Number(process.env.ICMP_BATCH_SIZE ?? '10');
export const ICMP_POLL_INTERVAL = process.env.ICMP_POLL_INTERVAL ?? '*/1 * * * *';
export const ICMP_PING_RETRIES = 2;
export const ICMP_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// SNMP Worker constants
export const SNMP_BATCH_SIZE = Number(process.env.SNMP_BATCH_SIZE ?? '5');
export const SNMP_POLL_INTERVAL = process.env.SNMP_POLL_INTERVAL ?? '*/5 * * * *';
export const SNMP_ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
export const SNMP_HIGH_CPU_THRESHOLD = Number(process.env.SNMP_HIGH_CPU_THRESHOLD ?? '85');
export const SNMP_HIGH_MEM_THRESHOLD = Number(process.env.SNMP_HIGH_MEM_THRESHOLD ?? '90');
// Hysteresis: resolve thresholds (5% below alert thresholds)
export const SNMP_HIGH_CPU_RESOLVE_THRESHOLD = Number(process.env.SNMP_HIGH_CPU_RESOLVE_THRESHOLD ?? '80');
export const SNMP_HIGH_MEM_RESOLVE_THRESHOLD = Number(process.env.SNMP_HIGH_MEM_RESOLVE_THRESHOLD ?? '85');
