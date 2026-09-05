import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

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
  const result = await prisma.$queryRaw<Array<{
    Variable_name: string;
    Value: string;
  }>>`SHOW STATUS LIKE 'Threads_%'`;
  
  const metrics: Record<string, number> = {};
  result.forEach(row => {
    metrics[row.Variable_name] = parseInt(row.Value, 10);
  });
  
  return {
    threadsConnected: metrics['Threads_connected'] || 0,
    threadsRunning: metrics['Threads_running'] || 0,
    threadsCached: metrics['Threads_cached'] || 0,
    threadsCreated: metrics['Threads_created'] || 0,
  };
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
