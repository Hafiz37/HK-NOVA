# API Documentation

## HK-Nova REST API Reference

**Base URL:** `http://localhost:3000` (Development)  
**Authentication:** JWT Bearer Token  
**API Version:** 1.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limits](#rate-limits)
3. [Pagination](#pagination)
4. [Error Handling](#error-handling)
5. [Common Workflows](#common-workflows)
6. [Code Examples](#code-examples)

---

## Authentication

All API requests (except `/api/auth/login`) require authentication via JWT token.

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "username": "admin",
    "role": "ADMIN"
  }
}
```

The token is returned as an HTTP-only cookie named `session`.

### Using the Token

Include the cookie in subsequent requests:

```bash
curl -X GET http://localhost:3000/api/devices \
  -b "session=<your-token>"
```

---

## Rate Limits

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Login | 5 requests | 1 minute |
| Mutations (POST/PUT/DELETE) | 30 requests | 1 minute |
| Reads (GET) | 60 requests | 1 minute |
| Exports | 5 requests | 1 minute |
| Device Tests | 10 requests | 1 minute |
| Provisioning | 10 requests | 1 minute |

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds until you can retry (on 429 errors)

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `sortBy`: Field to sort by
- `sortOrder`: `asc` or `desc` (default: `desc`)
- `search`: Search term (searches name, IP, location)

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Validation failed |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 409 | Conflict - Duplicate resource |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "error": "Error message",
  "details": {
    "field": ["validation error"]
  }
}
```

---

## Common Workflows

### 1. Create a Device

```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{
    "name": "Core Router 1",
    "ip": "192.168.1.1",
    "type": "ROUTER",
    "vendor": "Cisco",
    "location": "Data Center A"
  }'
```

### 2. Query Alerts

```bash
# Get active alerts
curl -X GET "http://localhost:3000/api/alerts?status=ACTIVE&severity=HIGH" \
  -b "session=<token>"
```

### 3. Execute Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/{workflowId}/execute \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{
    "variables": {
      "deviceId": "device-123",
      "threshold": 80
    }
  }'
```

### 4. Export Data

```bash
# Export devices to CSV
curl -X POST http://localhost:3000/api/export/devices \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{
    "format": "csv",
    "filters": {
      "type": "ROUTER"
    }
  }'
```

---

## Code Examples

### JavaScript/TypeScript

```typescript
// Login
async function login(username: string, password: string) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important for cookies
    body: JSON.stringify({ username, password }),
  });
  
  if (!response.ok) {
    throw new Error('Login failed');
  }
  
  return await response.json();
}

// Get devices
async function getDevices(filters?: { status?: string; type?: string }) {
  const params = new URLSearchParams(filters);
  const response = await fetch(`http://localhost:3000/api/devices?${params}`, {
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch devices');
  }
  
  return await response.json();
}

// Create alert
async function createAlert(data: {
  deviceId: string;
  type: string;
  severity: string;
  message: string;
}) {
  const response = await fetch('http://localhost:3000/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create alert');
  }
  
  return await response.json();
}
```

### Python

```python
import requests

class HKNovaClient:
    def __init__(self, base_url='http://localhost:3000'):
        self.base_url = base_url
        self.session = requests.Session()
    
    def login(self, username, password):
        response = self.session.post(
            f'{self.base_url}/api/auth/login',
            json={'username': username, 'password': password}
        )
        response.raise_for_status()
        return response.json()
    
    def get_devices(self, status=None, device_type=None):
        params = {}
        if status:
            params['status'] = status
        if device_type:
            params['type'] = device_type
        
        response = self.session.get(
            f'{self.base_url}/api/devices',
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def create_alert(self, device_id, alert_type, severity, message):
        response = self.session.post(
            f'{self.base_url}/api/alerts',
            json={
                'deviceId': device_id,
                'type': alert_type,
                'severity': severity,
                'message': message
            }
        )
        response.raise_for_status()
        return response.json()
    
    def acknowledge_alert(self, alert_id, notes=''):
        response = self.session.post(
            f'{self.base_url}/api/alerts/{alert_id}/acknowledge',
            json={'notes': notes}
        )
        response.raise_for_status()
        return response.json()

# Usage
client = HKNovaClient()
client.login('admin', 'admin123')

devices = client.get_devices(status='UP')
print(f'Found {len(devices["data"])} devices')
```

### cURL Examples

```bash
# Get all devices with pagination
curl -X GET "http://localhost:3000/api/devices?page=1&limit=20" \
  -b "session=<token>"

# Filter devices by status and type
curl -X GET "http://localhost:3000/api/devices?status=UP&type=ROUTER" \
  -b "session=<token>"

# Update device
curl -X PUT "http://localhost:3000/api/devices/device-id" \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{
    "name": "Updated Router Name",
    "location": "New Location"
  }'

# Test device connectivity
curl -X POST "http://localhost:3000/api/devices/device-id/test" \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{"testType": "icmp"}'

# Acknowledge alert
curl -X POST "http://localhost:3000/api/alerts/alert-id/acknowledge" \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{
    "notes": "Investigating the issue"
  }'

# Resolve alert
curl -X POST "http://localhost:3000/api/alerts/alert-id/resolve" \
  -H "Content-Type: application/json" \
  -b "session=<token>" \
  -d '{
    "resolution": "Issue resolved - router rebooted"
  }'

# Get metrics (Prometheus format)
curl -X GET "http://localhost:3000/api/metrics"
```

---

## Workflow API

### Condition Syntax

Conditions use mathematical expressions:

```javascript
// Comparison operators
value > 10
cpu >= 80
status == "UP"
severity != "LOW"

// Logical operators
cpu > 80 && memory > 70
status == "DOWN" || latency > 100

// Mathematical operations
(current - baseline) / baseline > 0.5
value * 100 / total >= threshold
```

**Supported Variables:**
- Numeric: `value`, `threshold`, `cpu`, `memory`, `latency`
- String: `status`, `type`, `severity`, `deviceId`
- Nested: `device.status`, `alert.severity`

**Security:**
- Expressions are sandboxed - no code execution allowed
- Blocked patterns: `eval()`, `Function()`, `require()`, `process`, `__proto__`

---

## Interactive Documentation

- **Swagger UI:** [http://localhost:3000/docs/api](http://localhost:3000/docs/api)
- **Postman Collection:** Run `pnpm generate:postman` to generate `postman-collection.json`
- **OpenAPI Spec:** Available at `/api-docs`

---

## Support

For issues or questions:
- GitHub Issues: [Report a bug](https://github.com/yourusername/hk-nova/issues)
- Documentation: See `/docs` folder
- Runbook: `RUNBOOK.md` for operational procedures
