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

// Historical baseline constants
export const BASELINE_WINDOW_HOURS = Number(process.env.BASELINE_WINDOW_HOURS ?? '24');
export const BASELINE_MIN_SAMPLES = 3;
export const BASELINE_WARN_SIGMA = 2;
export const BASELINE_CRIT_SIGMA = 3;

// Anomaly Detection (ML) constants
export const ANOMALY_TRAINING_DAYS = Number(process.env.ANOMALY_TRAINING_DAYS ?? '7');
export const ANOMALY_MIN_SAMPLES = Number(process.env.ANOMALY_MIN_SAMPLES ?? '50');
export const ANOMALY_POLL_INTERVAL = process.env.ANOMALY_POLL_INTERVAL ?? '*/5 * * * *';
// Threshold fallback (tanpa model): nilai 0-1 skor absolut. Saat model tersedia,
// klasifikasi memakai persentil distribusi skor training (p90/p95/p99).
export const ANOMALY_SCORE_THRESHOLD_HIGH = Number(process.env.ANOMALY_SCORE_THRESHOLD_HIGH ?? '0.7');
export const ANOMALY_SCORE_THRESHOLD_CRITICAL = Number(process.env.ANOMALY_SCORE_THRESHOLD_CRITICAL ?? '0.85');
export const ANOMALY_ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
export const ANOMALY_MODEL_RETRAIN_HOURS = 24; // Re-train model every 24 hours
