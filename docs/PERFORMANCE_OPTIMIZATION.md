# HK-NOVA Performance Optimization Guide

## Week 8, Day 2-3: Performance Optimization Implementation

### Overview
This guide provides actionable steps to optimize HK-NOVA's performance after load testing.

---

## 1. Database Query Optimization

### Common Bottlenecks
```typescript
// ❌ BAD: N+1 Query Problem
async function getDevicesWithMetrics() {
  const devices = await prisma.device.findMany();
  
  for (const device of devices) {
    device.metrics = await prisma.metric.findMany({
      where: { deviceId: device.id }
    });
  }
  
  return devices;
}

// ✅ GOOD: Use Prisma includes
async function getDevicesWithMetrics() {
  return prisma.device.findMany({
    include: {
      metrics: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      }
    }
  });
}
```

### Add Database Indices
```sql
-- Add indices for frequently queried fields
CREATE INDEX idx_device_type ON Device(type);
CREATE INDEX idx_device_status ON Device(status);
CREATE INDEX idx_device_region ON Device(region);
CREATE INDEX idx_metric_device_timestamp ON Metric(deviceId, timestamp DESC);
CREATE INDEX idx_audit_timestamp ON AuditLog(timestamp DESC);
CREATE INDEX idx_audit_user ON AuditLog(userId, timestamp DESC);
CREATE INDEX idx_discovery_job_status ON DiscoveryJob(status, createdAt DESC);

-- Composite indices for common queries
CREATE INDEX idx_device_type_status ON Device(type, status);
CREATE INDEX idx_metric_device_type_timestamp ON Metric(deviceId, metricType, timestamp DESC);
```

### Pagination
```typescript
// ✅ GOOD: Cursor-based pagination for large datasets
export async function getDevicesPaginated(cursor?: string, limit = 50) {
  return prisma.device.findMany({
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    orderBy: { createdAt: 'desc' },
  });
}
```

---

## 2. Response Caching Strategy

### Implementation Priorities

#### High Priority (Cache First)
- ✅ Device list (5 min TTL)
- ✅ Device details (3 min TTL)
- ✅ Metrics aggregations (1 min TTL)
- ✅ Discovery job status (30 sec TTL)

#### Medium Priority
- Static configuration
- User permissions
- System settings

#### Never Cache
- Real-time SSH commands
- Authentication tokens
- Audit logs
- Active configuration changes

### Cache Implementation
```typescript
// src/app/api/devices/route.ts
import { performanceCache, cacheDeviceList } from '@/lib/performance-cache';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const cacheKey = cacheDeviceList(userId!);
  
  // Check cache
  const cached = performanceCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached.data, {
      headers: {
        'X-Cache': 'HIT',
        'ETag': cached.etag,
      },
    });
  }
  
  // Fetch from database
  const devices = await prisma.device.findMany({
    where: { userId },
    include: { _count: { select: { metrics: true } } },
  });
  
  // Store in cache
  performanceCache.set(cacheKey, devices, 300_000); // 5 min
  
  return NextResponse.json(devices, {
    headers: { 'X-Cache': 'MISS' },
  });
}
```

---

## 3. Bundle Size Optimization

### Analysis
```bash
# Analyze bundle size
pnpm build
pnpm dlx @next/bundle-analyzer

# Check for large dependencies
npx webpack-bundle-analyzer .next/analyze/client.html
```

### Optimization Strategies

#### 1. Dynamic Imports
```typescript
// ❌ BAD: Import heavy library at top level
import { Chart } from 'chart.js';

export default function Dashboard() {
  return <Chart data={data} />;
}

// ✅ GOOD: Dynamic import
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('chart.js').then(mod => mod.Chart), {
  loading: () => <p>Loading chart...</p>,
  ssr: false,
});

export default function Dashboard() {
  return <Chart data={data} />;
}
```

#### 2. Tree Shaking
```typescript
// ❌ BAD: Import entire library
import _ from 'lodash';
const result = _.uniq(array);

// ✅ GOOD: Import specific function
import uniq from 'lodash/uniq';
const result = uniq(array);
```

#### 3. Code Splitting
```typescript
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2,
          },
          lib: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              const packageName = module.context.match(
                /[\\/]node_modules[\\/](.*?)([\\/]|$)/
              )[1];
              return `npm.${packageName.replace('@', '')}`;
            },
          },
        },
      };
    }
    return config;
  },
};
```

---

## 4. Connection Pool Tuning

### MySQL Connection Pool
```typescript
// prisma/schema.prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
  
  // Optimized pool settings
  relationMode = "prisma"
}

// Connection string format:
// mysql://user:pass@host:3306/db?connection_limit=50&pool_timeout=10
```

### Redis Connection Pool
```typescript
// src/lib/redis-pool.ts
import Redis from 'ioredis';

export const redisPool = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  
  // Connection pool settings
  connectionName: 'hk-nova',
  lazyConnect: false,
  
  // Performance settings
  keepAlive: 30000,
  family: 4,
  
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});
```

### SSH Connection Pool Tuning
```typescript
// src/lib/ssh-pool.ts - UPDATE CONFIG
export const sshPool = new SSHConnectionPool({
  maxConnectionsPerDevice: 3,        // Increase from 2
  maxIdleTimeMs: 120_000,           // Increase to 2 minutes
  maxConnectionLifetimeMs: 900_000,  // Increase to 15 minutes
  maxUsageCount: 100,               // Increase from 50
  cleanupIntervalMs: 60_000,        // Cleanup every 1 minute
});
```

---

## 5. Asset Optimization

### Image Optimization
```typescript
// Use Next.js Image component
import Image from 'next/image';

export function DeviceIcon({ device }) {
  return (
    <Image
      src={`/icons/${device.type}.png`}
      alt={device.name}
      width={32}
      height={32}
      loading="lazy"
      placeholder="blur"
    />
  );
}
```

### Static Asset Configuration
```javascript
// next.config.js
module.exports = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96],
  },
  
  compress: true,
  
  // Enable SWC minification
  swcMinify: true,
  
  // Headers for caching
  async headers() {
    return [
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};
```

---

## 6. API Rate Limiting

### Implementation
```typescript
// src/middleware/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
});

export async function rateLimit(req: NextRequest) {
  const ip = req.ip ?? '127.0.0.1';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);
  
  if (!success) {
    return new NextResponse('Rate limit exceeded', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    });
  }
  
  return null;
}
```

---

## 7. Monitoring & Alerting

### Performance Metrics to Track
```typescript
// src/app/api/metrics/route.ts
import { performanceMonitor, getPrometheusMetrics } from '@/lib/performance-monitor';

export async function GET() {
  const metrics = getPrometheusMetrics();
  
  return new Response(metrics, {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4',
    },
  });
}
```

### Key Metrics
- **Response Time**: p50, p95, p99
- **Error Rate**: 4xx and 5xx responses
- **Throughput**: Requests per second
- **Cache Hit Rate**: % of cached responses
- **Database Query Time**: Average and p95
- **SSH Connection Pool**: Active/idle connections
- **Memory Usage**: Heap size and growth rate
- **CPU Usage**: % utilization

---

## 8. Performance Testing Checklist

### Before Optimization
- [ ] Run baseline performance test
- [ ] Document current metrics
- [ ] Identify top 5 slowest endpoints
- [ ] Profile database queries
- [ ] Measure bundle size

### After Optimization
- [ ] Re-run performance tests
- [ ] Compare metrics with baseline
- [ ] Verify improvements meet targets
- [ ] Check for regressions
- [ ] Update documentation

### Target Metrics (500 Devices)
- ✅ Device list API: < 200ms (p95)
- ✅ Device details API: < 100ms (p95)
- ✅ SSH command execution: < 2s (p95)
- ✅ Discovery job (10 devices): < 30s
- ✅ Bulk config (5 devices): < 15s
- ✅ Cache hit rate: > 70%
- ✅ Error rate: < 1%

---

## Next Steps

1. Implement caching layer
2. Add database indices
3. Optimize bundle size
4. Tune connection pools
5. Run performance tests
6. Compare results with baseline
7. Iterate on bottlenecks
