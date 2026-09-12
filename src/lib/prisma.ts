import { PrismaClient } from '@prisma/client';
import { databaseConnectionsActive, databaseQueryDuration } from './metrics';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrlWithPoolConfig(): string | undefined {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) return undefined;
  try {
    const url = new URL(urlStr);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '20');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }
    return url.toString();
  } catch {
    return urlStr;
  }
}

function createPrismaClient(): PrismaClient {
  const dbUrl = getDatabaseUrlWithPoolConfig();
  const client = new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

  client.$use(async (params, next) => {
    const start = Date.now();
    const queryTimeout = 10000;
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Query timeout after ${queryTimeout}ms: ${params.model}.${params.action}`)), queryTimeout)
    );
    
    try {
      const result = await Promise.race([next(params), timeoutPromise]);
      const duration = (Date.now() - start) / 1000;
      
      databaseQueryDuration.observe(
        {
          operation: params.action,
          table: params.model || 'unknown',
        },
        duration
      );
      
      return result;
    } catch (error) {
      const duration = (Date.now() - start) / 1000;
      databaseQueryDuration.observe(
        {
          operation: params.action,
          table: params.model || 'unknown',
        },
        duration
      );
      throw error;
    }
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let isShuttingDown = false;

export async function disconnectPrisma() {
  if (!isShuttingDown) {
    isShuttingDown = true;
    await prisma.$disconnect();
  }
}

process.on('beforeExit', async () => {
  await disconnectPrisma();
});

process.on('SIGINT', async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});

export async function getDatabasePoolMetrics() {
  try {
    const result = await prisma.$queryRaw<Array<{
      Variable_name: string;
      Value: string;
    }>>`SHOW STATUS LIKE 'Threads_%'`;
    
    const metrics: Record<string, number> = {};
    result.forEach(row => {
      metrics[row.Variable_name] = parseInt(row.Value, 10);
    });
    
    const connected = metrics['Threads_connected'] || 0;
    databaseConnectionsActive.set(connected);
    
    return {
      threadsConnected: connected,
      threadsRunning: metrics['Threads_running'] || 0,
      threadsCached: metrics['Threads_cached'] || 0,
      threadsCreated: metrics['Threads_created'] || 0,
    };
  } catch (err) {
    console.error('[Prisma] Failed to get pool metrics:', err);
    return {
      threadsConnected: 0,
      threadsRunning: 0,
      threadsCached: 0,
      threadsCreated: 0,
    };
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    console.error('[Prisma] Health check failed:', err);
    return false;
  }
}

setInterval(async () => {
  await getDatabasePoolMetrics();
}, 10_000);

export default prisma;
