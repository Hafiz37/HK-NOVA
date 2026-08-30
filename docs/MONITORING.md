# Monitoring & Observability

## Overview

HK-Nova provides comprehensive monitoring capabilities through Prometheus metrics, audit log analytics, and real-time dashboards.

---

## Prometheus Metrics

### Metrics Endpoint

```bash
# Prometheus scrape endpoint
curl http://localhost:3000/api/metrics
```

**Configuration for Prometheus:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'hk-nova'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
```

### Available Metrics

#### HTTP Metrics

```
http_requests_total{method, route, status}              # Counter: Total HTTP requests
http_request_duration_seconds{method, route, status}    # Histogram: Request duration
http_errors_total{method, route, status}                # Counter: HTTP errors
```

#### Device Metrics

```
devices_total{status, type}                             # Gauge: Total devices by status/type
device_status_changes_total{from_status, to_status, type} # Counter: Status changes
```

#### Alert Metrics

```
alerts_active{severity, type}                           # Gauge: Active alerts
alerts_created_total{severity, type}                    # Counter: Alerts created
alerts_resolved_total{severity, type}                   # Counter: Alerts resolved
alert_resolution_duration_seconds{severity, type}       # Histogram: Time to resolve
```

#### Workflow Metrics

```
workflow_executions_total{workflow_id, status}          # Counter: Workflow runs
workflow_execution_duration_seconds{workflow_id, status} # Histogram: Execution time
condition_evaluations_total{result, has_error}          # Counter: Condition checks
condition_evaluation_duration_seconds                   # Histogram: Evaluation time
```

#### Rate Limiting Metrics

```
rate_limit_checks_total{endpoint, result}               # Counter: Rate limit checks
rate_limit_violations_total{endpoint, ip}               # Counter: Violations
rate_limit_tokens_remaining{endpoint, identifier}       # Gauge: Available tokens
```

#### Worker Metrics

```
worker_last_run_timestamp{worker_name}                  # Gauge: Last successful run (unix timestamp)
worker_execution_duration_seconds{worker_name, status}  # Histogram: Worker duration
worker_errors_total{worker_name, error_type}            # Counter: Worker errors
```

#### Security Metrics

```
audit_logs_total{action, entity_type, user_role}        # Counter: Audit log entries
suspicious_patterns_detected_total{pattern_type, severity} # Counter: Security alerts
failed_logins_total{username, ip}                       # Counter: Failed logins
active_sessions{user_role}                              # Gauge: Active sessions
```

#### Backup Metrics

```
backups_total{device_type, status}                      # Counter: Backups performed
backup_duration_seconds{device_type, status}            # Histogram: Backup duration
```

#### Anomaly Metrics

```
anomalies_detected_total{severity, device_type}         # Counter: Anomalies found
anomaly_score{device_id, metric_type}                   # Gauge: Current anomaly score
```

#### System Metrics

```
database_query_duration_seconds{operation, table}       # Histogram: Query performance
database_connections_active                             # Gauge: Active DB connections
cache_hits_total{cache_type}                            # Counter: Cache hits
cache_misses_total{cache_type}                          # Counter: Cache misses
```

---

## Dashboards

### 1. Platform Monitoring Dashboard

**URL:** `http://localhost:3000/dashboard/platform-monitoring`

**Features:**
- Real-time condition evaluation trends
- Rate limit violations by endpoint
- Suspicious pattern alerts
- Worker health status
- Link to raw Prometheus metrics

**Refresh:** Every 30 seconds

### 2. Network Monitoring Dashboard

**URL:** `http://localhost:3000/dashboard/monitoring`

**Features:**
- Device status overview
- Latency & packet loss charts
- Alert timeline
- ICMP/SNMP metrics
- Real-time updates via SSE

### 3. Alert Dashboard

**URL:** `http://localhost:3000/dashboard/alerts`

**Features:**
- Active alerts with severity filtering
- Escalation levels
- SLA compliance tracking
- MTTR (Mean Time To Resolve)
- Alert correlation visualization

### 4. Audit Log Dashboard

**URL:** `http://localhost:3000/dashboard/audit-logs`

**Features:**
- User activity timeline
- Failed login patterns
- Privileged operation tracking
- Geographic IP distribution
- Anomaly detection

---

## Grafana Integration (Recommended)

### Setup Grafana

```bash
# Docker
docker run -d -p 3001:3000 --name=grafana grafana/grafana

# Add Prometheus data source
# URL: http://localhost:9090
```

### Sample Grafana Dashboards

#### API Performance Dashboard

```json
{
  "panels": [
    {
      "title": "Request Rate",
      "targets": [{
        "expr": "rate(http_requests_total[5m])"
      }]
    },
    {
      "title": "P95 Latency",
      "targets": [{
        "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
      }]
    },
    {
      "title": "Error Rate",
      "targets": [{
        "expr": "rate(http_errors_total[5m])"
      }]
    }
  ]
}
```

#### Alert Trends Dashboard

```json
{
  "panels": [
    {
      "title": "Active Alerts by Severity",
      "targets": [{
        "expr": "sum by (severity) (alerts_active)"
      }]
    },
    {
      "title": "Alert Creation Rate",
      "targets": [{
        "expr": "rate(alerts_created_total[1h])"
      }]
    },
    {
      "title": "Mean Time To Resolve",
      "targets": [{
        "expr": "histogram_quantile(0.5, rate(alert_resolution_duration_seconds_bucket[24h]))"
      }]
    }
  ]
}
```

#### Worker Health Dashboard

```json
{
  "panels": [
    {
      "title": "Worker Lag (seconds)",
      "targets": [{
        "expr": "time() - worker_last_run_timestamp"
      }]
    },
    {
      "title": "Worker Error Rate",
      "targets": [{
        "expr": "rate(worker_errors_total[5m])"
      }]
    }
  ]
}
```

---

## Alerting Rules

### Prometheus Alert Manager

```yaml
# alert.rules.yml
groups:
  - name: hk-nova
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"
      
      # Worker lag
      - alert: WorkerLag
        expr: time() - worker_last_run_timestamp > 600
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Worker {{ $labels.worker_name }} is lagging"
          description: "Last run was {{ $value }} seconds ago"
      
      # High alert volume
      - alert: HighAlertVolume
        expr: rate(alerts_created_total[5m]) > 10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High alert creation rate"
          description: "Creating {{ $value }} alerts/sec"
      
      # Rate limit violations spike
      - alert: RateLimitViolationSpike
        expr: rate(rate_limit_violations_total[5m]) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High rate limit violations"
          description: "{{ $value }} violations/sec on {{ $labels.endpoint }}"
      
      # Suspicious patterns
      - alert: SuspiciousActivity
        expr: rate(suspicious_patterns_detected_total[5m]) > 0
        labels:
          severity: high
        annotations:
          summary: "Suspicious activity detected"
          description: "{{ $labels.pattern_type }} - {{ $labels.severity }}"
```

---

## Audit Log Analytics

### API Endpoints

```bash
# Get suspicious patterns
GET /api/audit-logs/monitoring/patterns?hours=24

# Get audit analytics
GET /api/audit-logs/analytics?startDate=2026-08-01&endDate=2026-08-30

# Get anomalous access patterns
GET /api/audit-logs/anomalies?hours=24
```

### Suspicious Pattern Types

- **High Failed Logins:** > 50 attempts (medium), > 100 (high)
- **Bulk Deletions:** > 10 deletes (medium), > 20 (high)
- **Data Exports:** > 10 exports (medium)
- **Privilege Escalations:** > 5 role changes (high)
- **Unusual Hour Access:** 3x above average activity
- **Activity Spikes:** 5x daily average

---

## Real-Time Monitoring

### Server-Sent Events (SSE)

```javascript
// Subscribe to real-time updates
const eventSource = new EventSource('/api/realtime/monitoring');

eventSource.addEventListener('device-status', (event) => {
  const data = JSON.parse(event.data);
  console.log('Device status changed:', data);
});

eventSource.addEventListener('alert-created', (event) => {
  const data = JSON.parse(event.data);
  console.log('New alert:', data);
});
```

**Available Events:**
- `device-status`: Device UP/DOWN changes
- `alert-created`: New alert
- `alert-resolved`: Alert resolved
- `anomaly-detected`: ML anomaly found
- `backup-completed`: Backup finished
- `provisioning-status`: Provisioning update

---

## Performance Monitoring

### Key Metrics to Watch

1. **API Latency**
   - P50 < 100ms
   - P95 < 500ms
   - P99 < 1000ms

2. **Database Performance**
   - Query time P95 < 100ms
   - Connection pool utilization < 80%

3. **Worker Health**
   - Lag < 5 minutes
   - Error rate < 1%

4. **Memory Usage**
   - Heap usage < 80%
   - RSS < 1GB (web server)

5. **Alert SLA**
   - Acknowledgment time < 15 minutes
   - Resolution time < 4 hours

---

## Troubleshooting

### High Memory Usage

```bash
# Check heap usage
curl http://localhost:3000/api/platform/health | jq '.memory'

# Restart workers if needed
pnpm pm2:restart
```

### Worker Not Running

```bash
# Check worker status
curl http://localhost:3000/api/workers/status

# Check last metric timestamp
# If > 5 minutes, worker is stalled
```

### Rate Limit Issues

```bash
# Check violations
curl http://localhost:3000/api/metrics | grep rate_limit_violations

# Adjust limits in .env
RATE_LIMIT_MUTATION_LIMIT=50
```

### High Alert Volume

```bash
# Check alert creation rate
curl http://localhost:3000/api/metrics | grep alerts_created_total

# Review alert rules
# Consider adjusting thresholds or enabling cooldown
```

---

## Best Practices

1. **Set up Grafana dashboards** for long-term trend analysis
2. **Configure alert manager** for critical metrics
3. **Review audit logs** daily for security anomalies
4. **Monitor worker health** - set up alerts for lag > 10 minutes
5. **Track API latency** - investigate P95 > 500ms
6. **Archive old metrics** - retain 30 days in database
7. **Export Prometheus data** - to time-series DB for long-term storage

---

## Related Documentation

- [Architecture](ARCHITECTURE.md) - System design
- [Benchmarks](BENCHMARKS.md) - Performance targets
- [Runbook](../RUNBOOK.md) - Operational procedures

---

**Last Updated:** 2026-08-30  
**Monitoring Version:** 1.0
