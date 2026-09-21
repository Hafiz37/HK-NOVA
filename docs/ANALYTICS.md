# Analytics Dashboard Guide

Comprehensive guide to HK-NOVA's analytics features for monitoring backup operations, device health, and storage trends.

---

## Overview

HK-NOVA v1.0 includes a comprehensive analytics dashboard powered by ApexCharts, providing real-time insights into:
- Backup activity trends over time
- Job success rates and reliability metrics
- Storage consumption and growth patterns
- Device health and status distribution
- Group-level performance comparison

Analytics help you understand system behavior, identify issues proactively, and optimize backup strategies.

---

## Accessing Analytics

**Via Web UI:**
1. Navigate to **Analytics** in the main navigation menu
2. Dashboard displays with default 30-day view
3. Interactive charts load automatically

**Via REST API:**
- All analytics available as JSON endpoints at `/api/v1/analytics/*`
- Supports programmatic access for integration with monitoring tools
- Rate limited to 30 requests/minute per IP

---

## Available Metrics

### 1. Backup Trends

**Chart Type:** Time series line chart with area fill  
**Purpose:** Visualize daily backup activity over time  
**Location:** Top section of Analytics dashboard

**Metrics Displayed:**
- Total backups per day
- Successful backups (green line)
- Failed backups (red line)
- Daily count markers

**Features:**
- **Interactive tooltips:** Hover over any point to see exact counts
- **Time range selector:** 7, 30, 60, or 90 days
- **Zoom capability:** Click and drag to zoom into specific period
- **Legend toggle:** Click legend items to show/hide series

**Interpretation:**
- **Consistent daily peaks:** Healthy scheduled backup pattern
- **Sudden drops:** Scheduler issues or device unavailability
- **Spikes:** Manual backups or catch-up after outage
- **Increasing failures:** Growing infrastructure issues

**Use Cases:**
- Verify backup schedules are running as configured
- Identify backup frequency patterns
- Spot unusual activity requiring investigation
- Validate retention policy effectiveness

**API Endpoint:**
```bash
GET /api/v1/analytics/backup-trend?days=30
```

**Response Example:**
```json
{
  "labels": ["2026-09-01", "2026-09-02", "2026-09-03"],
  "successful": [45, 47, 46],
  "failed": [2, 1, 3],
  "total": [47, 48, 49]
}
```

### 2. Device Status Distribution

**Chart Type:** Donut chart with center statistics  
**Purpose:** Overview of device inventory and categorization  
**Location:** Left column, middle section

**Metrics Displayed:**
- Total active devices (center count)
- Devices by backup engine type (colored segments)
  - Netmiko (blue)
  - SCP (green)
  - Oxidized (orange)
  - pfSense (purple)
  - Proxmox (red)
- Percentage breakdown per engine

**Features:**
- **Segment hover:** Shows exact device count per engine
- **Click to filter:** (Future enhancement) Filter other charts by engine
- **Responsive legend:** Shows engine names and counts

**Interpretation:**
- **Balanced distribution:** Healthy multi-engine deployment
- **Single engine dominance:** May indicate specialized environment
- **Zero devices:** Engine not in use, can be ignored

**Use Cases:**
- Quick inventory check
- Engine distribution analysis
- Capacity planning per engine type
- Identify underutilized backup engines

**API Endpoint:**
```bash
GET /api/v1/analytics/device-status
```

**Response Example:**
```json
{
  "total_devices": 87,
  "by_engine": {
    "netmiko": 65,
    "scp": 12,
    "oxidized": 8,
    "pfsense": 2,
    "proxmox": 0
  }
}
```

### 3. Job Success Rate

**Chart Type:** Time series area chart with percentage line  
**Purpose:** Track backup reliability and SLA compliance  
**Location:** Right column, middle section

**Metrics Displayed:**
- Success rate percentage over time (0-100%)
- Rolling average trend line
- Daily success/failure counts

**Features:**
- **Threshold indicators:** Visual markers at 90% and 95%
- **Color coding:** Green (>95%), yellow (90-95%), red (<90%)
- **Time range selector:** 7, 30, 60, or 90 days

**Interpretation:**
- **Above 95%:** Excellent reliability
- **90-95%:** Acceptable, monitor for degradation
- **Below 90%:** Action required, investigate failures
- **Declining trend:** Infrastructure or credential issues

**Use Cases:**
- SLA compliance monitoring and reporting
- Identify problematic time periods
- Detect capacity issues (too many concurrent jobs)
- Justify infrastructure investments
- Proactive issue detection

**API Endpoint:**
```bash
GET /api/v1/analytics/job-success-rate?days=30
```

**Response Example:**
```json
{
  "labels": ["2026-09-01", "2026-09-02", "2026-09-03"],
  "success_rate": [97.5, 96.8, 98.2],
  "total_jobs": [45, 47, 46],
  "successful_jobs": [44, 46, 45]
}
```

### 4. Storage Growth Trends

**Chart Type:** Time series bar chart with cumulative line  
**Purpose:** Monitor storage consumption and predict capacity needs  
**Location:** Bottom section, full width

**Metrics Displayed:**
- Daily backup size totals (bars)
- Cumulative storage used (line)
- Size in MB/GB with automatic unit conversion
- Per-destination breakdown (stacked bars)

**Features:**
- **Stacked view:** See contribution from each destination
- **Hover details:** Exact size per destination per day
- **Growth rate calculation:** Average MB/day displayed
- **Projection:** Estimated disk usage in 30/60/90 days

**Interpretation:**
- **Linear growth:** Healthy, predictable pattern
- **Sudden spikes:** Large config changes or new devices
- **Exponential growth:** Retention policy may need adjustment
- **Flat line:** No backups running, investigate scheduler

**Use Cases:**
- Capacity planning for disk space
- Identify abnormally large configurations
- Optimize retention policies
- Budget forecasting for storage expansion
- Detect compression opportunities

**API Endpoint:**
```bash
GET /api/v1/analytics/backup-size-trend?days=30
```

**Response Example:**
```json
{
  "labels": ["2026-09-01", "2026-09-02"],
  "sizes_mb": [245.3, 248.7],
  "cumulative_gb": [12.5, 12.75],
  "avg_growth_mb_per_day": 3.4
}
```

### 5. Group Analytics

**Chart Type:** Data table with sorting and filtering  
**Purpose:** Compare performance across device groups and locations  
**Location:** Analytics → Group Stats tab

**Metrics Displayed:**
| Column | Description |
|--------|-------------|
| Group Name | Device group or location name |
| Device Count | Number of devices in group |
| Success Rate | Backup success percentage (last 30 days) |
| Last Backup | Timestamp of most recent backup |
| Avg Size | Average backup size per device |
| Total Backups | Total backup count for group |

**Features:**
- **Sortable columns:** Click header to sort by any metric
- **Search:** Filter groups by name
- **Color coding:** Red (<90%), yellow (90-95%), green (>95%)
- **Export:** Download as CSV

**Interpretation:**
- **Low success rate:** Group-specific credential or network issue
- **No recent backups:** Group excluded from schedules
- **Large avg size:** Complex devices or inefficient configs
- **Zero backups:** New group, not yet backed up

**Use Cases:**
- Identify underperforming groups requiring attention
- Departmental or location-based reporting
- Cross-location comparison
- Resource allocation decisions
- Service quality monitoring per customer (MSP use case)

**API Endpoint:**
```bash
GET /api/v1/analytics/group-stats
```

**Response Example:**
```json
{
  "groups": [
    {
      "name": "Tokyo Office",
      "device_count": 25,
      "success_rate": 98.5,
      "last_backup": "2026-09-20T05:30:00Z",
      "avg_size_mb": 12.3,
      "total_backups": 750
    }
  ]
}
```

---

## Interpreting Results

### Healthy System Indicators

✅ **Backup trends:**
- Consistent daily activity matching schedule frequency
- Low failure rate (<5%)
- Predictable peaks during scheduled backup windows

✅ **Success rate:**
- Above 95% consistently
- Minimal day-to-day variation
- Quick recovery after temporary dips

✅ **Storage growth:**
- Linear and predictable increase
- Growth rate matches expected device changes
- No sudden unexplained spikes

✅ **Device distribution:**
- All configured engines have devices
- Distribution matches infrastructure composition

✅ **Group analytics:**
- All groups have recent backups (<24 hours)
- Success rates above 95% across all groups
- Similar backup sizes within device type categories

### Warning Signs

⚠️ **Backup trends:**
- Sudden drop in daily backup counts → Check scheduler, verify it's running
- Increasing failure trend → Investigate credential expiration or device issues
- Gaps in timeline → Scheduler stopped, server downtime, or maintenance

⚠️ **Success rate:**
- Below 90% → Immediate investigation required
- Declining trend over weeks → Infrastructure degradation
- Persistent failures on same devices → Device-specific credential/connectivity issues

⚠️ **Storage growth:**
- Sudden 2x+ spike → Large config change, investigate if intentional
- Exponential growth → Retention policy not working, check GFS settings
- Flat line for days → Backups not running, check scheduler and logs

⚠️ **Device distribution:**
- High percentage of devices without recent backup
- Imbalanced engine distribution may indicate migration opportunity

⚠️ **Group analytics:**
- Group with 0% success rate → Group-wide credential or network issue
- Group with no backups in 24+ hours → Excluded from schedules or failed job
- Outlier groups with 10x avg size → Review device types, may need optimization

---

## Time Range Selection

All time-series charts support multiple time ranges to balance detail and overview:

| Time Range | Best For | Data Points |
|------------|----------|-------------|
| **7 days** | Detailed recent activity, troubleshooting current issues | Hourly granularity |
| **30 days** | Monthly trends, standard reporting (default) | Daily aggregates |
| **60 days** | Quarterly overview, medium-term planning | Daily aggregates |
| **90 days** | Long-term pattern analysis, capacity planning | Daily aggregates |

**How to change:**
1. Locate time range selector above each chart
2. Click desired range (7d / 30d / 60d / 90d)
3. Chart updates automatically with loading indicator

**Performance Note:** Longer time ranges may take 2-3 seconds to load on large datasets (>10,000 backups).

---

## Filtering and Segmentation

### Group Filtering

Filter all analytics to specific device groups:

1. Use **Group Filter** dropdown at top of Analytics page
2. Select one or more groups
3. All charts update to show only selected groups
4. Clear filter to return to all-devices view

**Use cases:**
- Focus on specific location or department
- Isolate problematic group for troubleshooting
- Generate reports for specific customer (MSP)

### Status Filtering

Filter backup trends by status:

1. Click legend items on Backup Trends chart
2. Toggle "Successful" or "Failed" series
3. View only desired status
4. Click again to restore

---

## Exporting Data

### Export Chart Images

1. Hover over any chart
2. Click **download icon** in top-right corner
3. Chart saves as PNG image (1200x600px)
4. Use for reports, presentations, documentation

### Export Raw Data via API

All analytics are available as JSON for integration:

**Bash + curl:**
```bash
# Get 30-day backup trend
curl -u admin:password \
  http://localhost:5005/api/v1/analytics/backup-trend?days=30 \
  -o backup-trend.json
```

**Python:**
```python
import requests
import json

response = requests.get(
    'http://localhost:5005/api/v1/analytics/backup-trend?days=30',
    auth=('admin', 'password')
)

data = response.json()

# Process data
for i, date in enumerate(data['labels']):
    print(f"{date}: {data['successful'][i]} successful, {data['failed'][i]} failed")
```

**PowerShell:**
```powershell
$cred = Get-Credential
$response = Invoke-RestMethod -Uri "http://localhost:5005/api/v1/analytics/backup-trend?days=30" -Credential $cred
$response | ConvertTo-Json | Out-File analytics.json
```

### Export Group Analytics as CSV

1. Navigate to **Analytics** → **Group Stats**
2. Click **Export CSV** button
3. File downloads with all group metrics
4. Open in Excel, Google Sheets, or import into reporting tools

---

## Integration Examples

### Grafana Dashboard

Integrate analytics into Grafana:

1. Use **JSON API data source**
2. Configure authentication (HTTP Basic Auth)
3. Create panels querying `/api/v1/analytics/*` endpoints
4. Set refresh interval (e.g., 5 minutes)
5. Build custom dashboard combining HK-NOVA + infrastructure metrics

### Scheduled Reports

Automate weekly reports via cron:

```bash
#!/bin/bash
# weekly-backup-report.sh

curl -u admin:password \
  http://localhost:5005/api/v1/analytics/job-success-rate?days=7 \
  | jq -r '.success_rate | add / length' \
  | mail -s "Weekly Backup Success Rate" ops-team@company.com
```

### Alerting on Thresholds

Monitor success rate and alert if below threshold:

```python
import requests
import smtplib

response = requests.get(
    'http://localhost:5005/api/v1/analytics/job-success-rate?days=1',
    auth=('admin', 'password')
)

data = response.json()
today_success_rate = data['success_rate'][-1]

if today_success_rate < 90:
    # Send alert via email, Slack, PagerDuty, etc.
    send_alert(f"Backup success rate dropped to {today_success_rate}%")
```

---

## Use Cases

### 1. SLA Compliance Reporting

**Scenario:** Demonstrate 99% backup success rate to stakeholders

**Steps:**
1. Navigate to Analytics → Job Success Rate
2. Select 90-day time range
3. Export chart as PNG
4. Export raw data via API for spreadsheet analysis
5. Include in monthly operations report

**Metrics to highlight:**
- Average success rate over period
- Uptime percentage
- Mean time to resolution for failures

### 2. Capacity Planning

**Scenario:** Predict when additional storage needed

**Steps:**
1. Navigate to Analytics → Storage Growth Trends
2. Review 90-day growth rate
3. Note average MB/day growth
4. Calculate: Days until disk full = (Available space MB) / (Avg growth MB/day)
5. Plan storage expansion 60 days before projected full date

**Action items:**
- If growth is linear: Simple capacity planning
- If growth accelerating: Review retention policies
- If growth excessive: Check for compression opportunities

### 3. Device Health Monitoring

**Scenario:** Identify devices with frequent backup failures

**Steps:**
1. Navigate to Backups page
2. Filter by Status: Failed
3. Sort by Device
4. Identify devices with multiple recent failures
5. Check Analytics → Group Stats for group-level patterns
6. Investigate:
   - Credential expiration
   - Network connectivity issues
   - Device configuration changes
   - Disk space issues on device

### 4. Operational Insights

**Scenario:** Optimize backup schedules to avoid overlap

**Steps:**
1. Navigate to Analytics → Backup Trends
2. Analyze 7-day view with hourly granularity
3. Identify peak backup times
4. Check Job History for concurrent job counts
5. Adjust schedules to distribute load
6. Monitor success rate improvement

### 5. Budget Justification

**Scenario:** Justify infrastructure investment to management

**Data to present:**
- Device count growth over 90 days
- Backup success rate trends showing reliability
- Storage consumption demonstrating need for expansion
- Group analytics showing coverage across departments
- Cost per device per month calculation

---

## Performance Considerations

### Query Performance

- **Database indexes:** Analytics queries use optimized indexes on `created_at`, `device_id`, `status`
- **Caching:** Group analytics cached for 5 minutes to reduce load
- **Large datasets:** Queries over 10,000 backups may take 2-3 seconds
- **Time range impact:** 90-day queries ~3x slower than 7-day queries

**Optimization tips:**
- Use shorter time ranges for interactive exploration
- Schedule long-range API queries during off-peak hours
- Consider archiving old backup records (>365 days) to separate table

### Browser Performance

- **Chart rendering:** ApexCharts uses client-side rendering
- **Data points:** Each chart renders 7-90 data points (days)
- **Memory usage:** ~50MB per dashboard page load
- **Refresh rate:** Default 5-minute auto-refresh

**Tips for low-spec devices:**
- Disable auto-refresh if experiencing lag
- Use API + external tools for very large time ranges
- Close unused browser tabs

---

## Related Documentation

- **[API.md](API.md)** — Complete REST API reference with authentication and rate limiting
- **[CONFIGURATION.md](CONFIGURATION.md)** — Database tuning and performance optimization
- **[INSTALL.md](INSTALL.md)** — Hardware requirements and sizing guidance
- **[LOCATION_MANAGEMENT.md](LOCATION_MANAGEMENT.md)** — Group-based analytics and reporting

---

## Troubleshooting

### Charts not loading

**Symptoms:** Spinner/loading indicator never completes

**Solutions:**
1. Check browser console for JavaScript errors
2. Verify API endpoint responding: `curl http://localhost:5005/api/v1/analytics/backup-trend?days=30`
3. Check server logs for database errors
4. Try different time range (start with 7 days)
5. Clear browser cache and reload

### Incorrect data displayed

**Symptoms:** Counts don't match Backups page

**Solutions:**
1. Check time range matches comparison period
2. Verify timezone settings (server vs browser)
3. Refresh analytics (may be cached)
4. Compare API response to database query
5. Check for active filters

### Slow performance

**Symptoms:** Charts take >10 seconds to load

**Solutions:**
1. Reduce time range (try 30 days instead of 90)
2. Check database size: `ls -lh hk-nova.db`
3. Run database maintenance: vacuum and analyze
4. Verify server resources (CPU/memory)
5. Consider database indexing if custom queries added

### Group analytics empty

**Symptoms:** No groups shown in Group Stats

**Solutions:**
1. Verify groups exist: Navigate to Groups page
2. Check devices assigned to groups
3. Verify backups exist for group devices
4. Try API call directly to debug: `GET /api/v1/analytics/group-stats`

### API returns 429 (Too Many Requests)

**Symptoms:** Rate limit exceeded error

**Solutions:**
1. Default limit: 30 requests/minute per IP
2. Wait 60 seconds and retry
3. Implement exponential backoff in API clients
4. For legitimate high-volume use, adjust rate limit in configuration
5. Check for runaway scripts making excessive requests
