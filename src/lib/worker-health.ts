export interface WorkerHealthStatus {
  workerName: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHeartbeat?: number;
  uptime?: number;
  cycleCount?: number;
  lastError?: string;
  metrics?: Record<string, number>;
}

interface WorkerHeartbeat {
  timestamp: number;
  cycleId?: string;
  cycleCount?: number;
}

const workerHeartbeats = new Map<string, WorkerHeartbeat>();
const workerStartTime = Date.now();

export function recordWorkerHeartbeat(
  workerName: string,
  cycleId?: string,
  cycleCount?: number
): void {
  workerHeartbeats.set(workerName, {
    timestamp: Date.now(),
    cycleId,
    cycleCount,
  });
}

export function getWorkerHealth(workerName: string): WorkerHealthStatus {
  const heartbeat = workerHeartbeats.get(workerName);
  
  if (!heartbeat) {
    return {
      workerName,
      status: 'unknown',
      uptime: Date.now() - workerStartTime,
    };
  }

  const timeSinceLastHeartbeat = Date.now() - heartbeat.timestamp;
  const isHealthy = timeSinceLastHeartbeat < 300000;

  return {
    workerName,
    status: isHealthy ? 'healthy' : 'unhealthy',
    lastHeartbeat: heartbeat.timestamp,
    uptime: Date.now() - workerStartTime,
    cycleCount: heartbeat.cycleCount,
  };
}

export function getAllWorkerHealth(): Record<string, WorkerHealthStatus> {
  const allWorkers = [
    'icmp-poller',
    'snmp-poller',
    'backup-worker',
    'anomaly-detector',
    'alert-escalator',
    'delivery-retry',
    'notification-digest',
    'digest-processor',
    'demo-generator',
    'scheduled-provisioning',
    'backup-archive-worker',
    'backup-notification-worker',
    'backup-retention-worker',
    'audit-retention-worker',
    'audit-verification-worker',
    'advanced-ml-worker',
  ];

  const health: Record<string, WorkerHealthStatus> = {};
  
  allWorkers.forEach((workerName) => {
    health[workerName] = getWorkerHealth(workerName);
  });

  return health;
}

export function getHealthSummary(): {
  healthy: number;
  unhealthy: number;
  unknown: number;
  total: number;
} {
  const health = getAllWorkerHealth();
  const values = Object.values(health);

  return {
    healthy: values.filter((h) => h.status === 'healthy').length,
    unhealthy: values.filter((h) => h.status === 'unhealthy').length,
    unknown: values.filter((h) => h.status === 'unknown').length,
    total: values.length,
  };
}

export function isSystemHealthy(): boolean {
  const summary = getHealthSummary();
  return summary.unhealthy === 0 && summary.healthy > 0;
}
