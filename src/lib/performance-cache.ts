import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

interface CacheEntry {
  data: any;
  timestamp: number;
  etag: string;
  hits: number;
}

class PerformanceCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;
  private ttl = 300_000; // 5 minutes default
  
  set(key: string, data: any, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    const etag = this.generateETag(data);
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      etag,
      hits: 0,
    });
  }
  
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    const age = Date.now() - entry.timestamp;
    
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    entry.hits++;
    return entry;
  }
  
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  invalidate(pattern: string): void {
    const regex = new RegExp(pattern);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getStats() {
    const entries = Array.from(this.cache.entries());
    const totalHits = entries.reduce((sum, [_, entry]) => sum + entry.hits, 0);
    const avgAge = entries.length > 0
      ? entries.reduce((sum, [_, entry]) => sum + (Date.now() - entry.timestamp), 0) / entries.length
      : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalHits,
      avgHits: entries.length > 0 ? totalHits / entries.length : 0,
      avgAge: avgAge / 1000, // in seconds
      hitRate: this.calculateHitRate(),
    };
  }
  
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestHits = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      const score = entry.hits / (Date.now() - entry.timestamp);
      
      if (score < lowestHits) {
        lowestHits = score;
        oldestKey = key;
        oldestTime = entry.timestamp;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
  
  private generateETag(data: any): string {
    const hash = createHash('md5');
    hash.update(JSON.stringify(data));
    return hash.digest('hex').substring(0, 16);
  }
  
  private calculateHitRate(): number {
    // This would need request tracking to be accurate
    return 0;
  }
}

// Singleton cache instance
export const performanceCache = new PerformanceCache();

// Cache middleware
export function withCache(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: { ttl?: number; key?: (req: NextRequest) => string } = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const cacheKey = options.key ? options.key(req) : req.url;
    
    // Check for cache hit
    const cached = performanceCache.get(cacheKey);
    
    if (cached) {
      const ifNoneMatch = req.headers.get('if-none-match');
      
      if (ifNoneMatch === cached.etag) {
        return new NextResponse(null, { status: 304 });
      }
      
      return NextResponse.json(cached.data, {
        headers: {
          'X-Cache': 'HIT',
          'ETag': cached.etag,
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    
    // Cache miss - execute handler
    const response = await handler(req);
    
    if (response.ok) {
      const data = await response.json();
      performanceCache.set(cacheKey, data, options.ttl);
      
      return NextResponse.json(data, {
        headers: {
          'X-Cache': 'MISS',
          'ETag': performanceCache.get(cacheKey)?.etag || '',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    
    return response;
  };
}

// Device list caching strategy
export function cacheDeviceList(userId: string): string {
  return `devices:user:${userId}`;
}

export function invalidateDeviceCache(deviceId?: string): void {
  if (deviceId) {
    performanceCache.invalidate(`devices:.*:${deviceId}`);
    performanceCache.invalidate(`device:${deviceId}:.*`);
  } else {
    performanceCache.invalidate(`devices:.*`);
  }
}

// Metrics caching
export function cacheMetrics(deviceId: string, metricType: string): string {
  return `metrics:${deviceId}:${metricType}`;
}

export function invalidateMetricsCache(deviceId: string): void {
  performanceCache.invalidate(`metrics:${deviceId}:.*`);
}

// Discovery job caching
export function cacheDiscoveryJob(jobId: string): string {
  return `discovery:job:${jobId}`;
}

export function invalidateDiscoveryCache(jobId: string): void {
  performanceCache.invalidate(`discovery:job:${jobId}`);
}
