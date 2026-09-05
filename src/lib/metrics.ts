import { Counter, Gauge, Histogram, register } from 'prom-client';

// HTTP Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status'],
});

// Business Metrics - Devices
export const devicesTotal = new Gauge({
  name: 'devices_total',
  help: 'Total number of monitored devices',
  labelNames: ['status', 'type'],
});

export const deviceStatusChanges = new Counter({
  name: 'device_status_changes_total',
  help: 'Total number of device status changes',
  labelNames: ['from_status', 'to_status', 'type'],
});

// Business Metrics - Alerts
export const alertsActive = new Gauge({
  name: 'alerts_active',
  help: 'Number of active alerts',
  labelNames: ['severity', 'type'],
});

export const alertsCreatedTotal = new Counter({
  name: 'alerts_created_total',
  help: 'Total number of alerts created',
  labelNames: ['severity', 'type'],
});

export const alertsResolvedTotal = new Counter({
  name: 'alerts_resolved_total',
  help: 'Total number of alerts resolved',
  labelNames: ['severity', 'type'],
});

export const alertResolutionDuration = new Histogram({
  name: 'alert_resolution_duration_seconds',
  help: 'Time taken to resolve alerts',
  labelNames: ['severity', 'type'],
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400], // 1m to 4h
});

// Business Metrics - Workflows
export const workflowExecutionsTotal = new Counter({
  name: 'workflow_executions_total',
  help: 'Total number of workflow executions',
  labelNames: ['workflow_id', 'status'],
});

export const workflowExecutionDuration = new Histogram({
  name: 'workflow_execution_duration_seconds',
  help: 'Duration of workflow executions',
  labelNames: ['workflow_id', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const conditionEvaluationsTotal = new Counter({
  name: 'condition_evaluations_total',
  help: 'Total number of condition evaluations',
  labelNames: ['result', 'has_error'],
});

export const conditionEvaluationDuration = new Histogram({
  name: 'condition_evaluation_duration_seconds',
  help: 'Duration of condition evaluations',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
});

// Business Metrics - Rate Limiting
export const rateLimitChecksTotal = new Counter({
  name: 'rate_limit_checks_total',
  help: 'Total number of rate limit checks',
  labelNames: ['endpoint', 'result'],
});

export const rateLimitViolationsTotal = new Counter({
  name: 'rate_limit_violations_total',
  help: 'Total number of rate limit violations',
  labelNames: ['endpoint', 'ip'],
});

export const rateLimitTokensRemaining = new Gauge({
  name: 'rate_limit_tokens_remaining',
  help: 'Remaining rate limit tokens',
  labelNames: ['endpoint', 'identifier'],
});

// Business Metrics - Workers
export const workerLastRunTimestamp = new Gauge({
  name: 'worker_last_run_timestamp',
  help: 'Unix timestamp of worker last successful run',
  labelNames: ['worker_name'],
});

export const workerExecutionDuration = new Histogram({
  name: 'worker_execution_duration_seconds',
  help: 'Duration of worker executions',
  labelNames: ['worker_name', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

export const workerErrorsTotal = new Counter({
  name: 'worker_errors_total',
  help: 'Total number of worker errors',
  labelNames: ['worker_name', 'error_type'],
});

// Business Metrics - Audit & Security
export const auditLogsTotal = new Counter({
  name: 'audit_logs_total',
  help: 'Total number of audit log entries',
  labelNames: ['action', 'entity_type', 'user_role'],
});

export const suspiciousPatternsDetected = new Counter({
  name: 'suspicious_patterns_detected_total',
  help: 'Total number of suspicious patterns detected',
  labelNames: ['pattern_type', 'severity'],
});

export const failedLoginsTotal = new Counter({
  name: 'failed_logins_total',
  help: 'Total number of failed login attempts',
  labelNames: ['username', 'ip'],
});

export const activeSessionsGauge = new Gauge({
  name: 'active_sessions',
  help: 'Number of active user sessions',
  labelNames: ['user_role'],
});

// Business Metrics - Backups
export const backupsTotal = new Counter({
  name: 'backups_total',
  help: 'Total number of backups',
  labelNames: ['device_type', 'status'],
});

export const backupDuration = new Histogram({
  name: 'backup_duration_seconds',
  help: 'Duration of backup operations',
  labelNames: ['device_type', 'status'],
  buckets: [5, 10, 30, 60, 120, 300],
});

// Business Metrics - Anomalies
export const anomaliesDetectedTotal = new Counter({
  name: 'anomalies_detected_total',
  help: 'Total number of anomalies detected',
  labelNames: ['severity', 'device_type'],
});

export const anomalyScoreGauge = new Gauge({
  name: 'anomaly_score',
  help: 'Current anomaly score',
  labelNames: ['device_id', 'metric_type'],
});

// Business Metrics - SSH Connection Pool
export const sshPoolConnectionsActive = new Gauge({
  name: 'ssh_pool_connections_active',
  help: 'Number of active SSH connections in pool',
});

export const sshPoolConnectionsCreated = new Counter({
  name: 'ssh_pool_connections_created_total',
  help: 'Total SSH connections created',
});

export const sshPoolConnectionsReused = new Counter({
  name: 'ssh_pool_connections_reused_total',
  help: 'Total SSH connection reuses',
});

export const sshPoolConnectionsDestroyed = new Counter({
  name: 'ssh_pool_connections_destroyed_total',
  help: 'Total SSH connections destroyed',
});

export const sshPoolDevices = new Gauge({
  name: 'ssh_pool_devices_total',
  help: 'Number of devices with pooled connections',
});

export const sshPoolConnectionsPerDevice = new Gauge({
  name: 'ssh_pool_connections_per_device',
  help: 'Number of connections per device',
  labelNames: ['device_id', 'state'],
});

// Business Metrics - Redis Connection Pool
export const redisConnectionsActive = new Gauge({
  name: 'redis_connections_active',
  help: 'Number of active Redis connections',
  labelNames: ['client_type'],
});

export const redisCommandDuration = new Histogram({
  name: 'redis_command_duration_seconds',
  help: 'Duration of Redis commands',
  labelNames: ['command'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

export const redisCommandsTotal = new Counter({
  name: 'redis_commands_total',
  help: 'Total number of Redis commands',
  labelNames: ['command', 'status'],
});

export const redisErrorsTotal = new Counter({
  name: 'redis_errors_total',
  help: 'Total number of Redis errors',
  labelNames: ['error_type'],
});

// System Metrics
export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

export const databaseConnectionsActive = new Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
});

export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
});

// Helper functions
export function recordHttpRequest(method: string, route: string, status: number, duration: number) {
  httpRequestsTotal.inc({ method, route, status: status.toString() });
  httpRequestDuration.observe({ method, route, status: status.toString() }, duration);
  
  if (status >= 400) {
    httpErrorsTotal.inc({ method, route, status: status.toString() });
  }
}

export function recordConditionEvaluation(success: boolean, hasError: boolean, duration: number) {
  conditionEvaluationsTotal.inc({ 
    result: success ? 'true' : 'false', 
    has_error: hasError ? 'true' : 'false' 
  });
  conditionEvaluationDuration.observe(duration);
}

export function recordRateLimitCheck(endpoint: string, allowed: boolean, ip?: string) {
  rateLimitChecksTotal.inc({ endpoint, result: allowed ? 'allowed' : 'denied' });
  
  if (!allowed && ip) {
    rateLimitViolationsTotal.inc({ endpoint, ip });
  }
}

export function recordWorkflowExecution(workflowId: string, status: string, duration: number) {
  workflowExecutionsTotal.inc({ workflow_id: workflowId, status });
  workflowExecutionDuration.observe({ workflow_id: workflowId, status }, duration);
}

export function updateDeviceMetrics(status: string, type: string, count: number) {
  devicesTotal.set({ status, type }, count);
}

export function updateAlertMetrics(severity: string, type: string, count: number) {
  alertsActive.set({ severity, type }, count);
}

export function recordAlertCreated(severity: string, type: string) {
  alertsCreatedTotal.inc({ severity, type });
}

export function recordAlertResolved(severity: string, type: string, durationSeconds: number) {
  alertsResolvedTotal.inc({ severity, type });
  alertResolutionDuration.observe({ severity, type }, durationSeconds);
}

export function updateWorkerLastRun(workerName: string) {
  workerLastRunTimestamp.set({ worker_name: workerName }, Date.now() / 1000);
}

export function recordWorkerExecution(workerName: string, status: string, duration: number) {
  workerExecutionDuration.observe({ worker_name: workerName, status }, duration);
}

export function recordSuspiciousPattern(patternType: string, severity: string) {
  suspiciousPatternsDetected.inc({ pattern_type: patternType, severity });
}

export function updateSSHPoolMetrics(metrics: {
  activeConnections: number;
  poolsCount: number;
  connectionsPerDevice: Array<{
    deviceId: string;
    total: number;
    inUse: number;
    idle: number;
  }>;
}) {
  sshPoolConnectionsActive.set(metrics.activeConnections);
  sshPoolDevices.set(metrics.poolsCount);
  
  metrics.connectionsPerDevice.forEach(({ deviceId, inUse, idle }) => {
    sshPoolConnectionsPerDevice.set({ device_id: deviceId, state: 'in_use' }, inUse);
    sshPoolConnectionsPerDevice.set({ device_id: deviceId, state: 'idle' }, idle);
  });
}

// Export register for metrics endpoint
export { register };
