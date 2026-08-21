import { PrismaClient } from '@prisma/client';

export interface BackupHealthScore {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
  metrics: {
    deviceCoverage: number; // % devices with recent backup
    successRate: number; // % successful backups
    avgDuration: number; // ms
    storageEfficiency: number; // compression ratio %
    criticalChangesRate: number; // % backups with critical changes
  };
  recommendations: string[];
}

export async function calculateBackupHealth(prisma: PrismaClient): Promise<BackupHealthScore> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Total active devices with backup enabled
  const totalDevices = await prisma.device.count({
    where: { deletedAt: null, isDemo: false, backupEnabled: true },
  });

  // Devices with recent backup (<7 days)
  const devicesWithRecentBackup = await prisma.device.count({
    where: {
      deletedAt: null,
      isDemo: false,
      backupEnabled: true,
      backups: {
        some: {
          timestamp: { gte: sevenDaysAgo },
          status: 'SUCCESS',
        },
      },
    },
  });

  // Last 100 backups stats
  const recentBackups = await prisma.backup.findMany({
    where: { timestamp: { gte: sevenDaysAgo } },
    select: { status: true, durationMs: true, sizeBytes: true, compressedBytes: true, riskScore: true },
    take: 100,
    orderBy: { timestamp: 'desc' },
  });

  const successCount = recentBackups.filter(b => b.status === 'SUCCESS').length;
  const successRate = recentBackups.length > 0 ? (successCount / recentBackups.length) * 100 : 0;

  const avgDuration = recentBackups.length > 0
    ? Math.round(recentBackups.reduce((sum, b) => sum + (b.durationMs || 0), 0) / recentBackups.length)
    : 0;

  // Storage efficiency: % saved by compression
  const compressionRatio = recentBackups.length > 0
    ? recentBackups.reduce((sum, b) => {
        if (b.sizeBytes && b.compressedBytes) {
          return sum + (b.compressedBytes / b.sizeBytes);
        }
        return sum;
      }, 0) / recentBackups.length
    : 0;

  const deviceCoverage = totalDevices > 0 ? (devicesWithRecentBackup / totalDevices) * 100 : 0;

  // Critical changes rate
  const criticalChangesCount = recentBackups.filter(b => (b.riskScore ?? 0) >= 70).length;
  const criticalChangesRate = recentBackups.length > 0 ? (criticalChangesCount / recentBackups.length) * 100 : 0;

  // Calculate score (weighted)
  const score = Math.round(
    deviceCoverage * 0.30 +      // 30% weight - coverage
    successRate * 0.30 +         // 30% weight - reliability
    (avgDuration < 30000 ? 20 : avgDuration < 60000 ? 10 : 0) + // 20% weight - performance
    (1 - compressionRatio) * 100 * 0.10 + // 10% weight - storage efficiency
    (criticalChangesRate < 10 ? 10 : criticalChangesRate < 25 ? 5 : 0) // 10% weight - stability
  );

  // Determine grade
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  // Identify issues
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (deviceCoverage < 95) {
    issues.push(`${(100 - deviceCoverage).toFixed(0)}% devices tanpa backup recent (<7 hari)`);
    recommendations.push('Periksa kredensial SSH dan jadwal backup untuk device yang gagal');
  }
  if (successRate < 95) {
    issues.push(`Backup success rate hanya ${successRate.toFixed(0)}%`);
    recommendations.push('Investasi error backup: SSH timeout, credential salah, atau device unreachable');
  }
  if (avgDuration > 60000) {
    issues.push(`Avg backup duration tinggi: ${(avgDuration / 1000).toFixed(0)}s`);
    recommendations.push('Optimasi jaringan atau kurangi concurrent backup');
  }
  if (compressionRatio > 0.5) {
    issues.push(`Compression ratio rendah: ${((1 - compressionRatio) * 100).toFixed(0)}% savings`);
    recommendations.push('Pastikan enkripsi+kompresi aktif (BACKUP_ENCRYPTION_KEY)');
  }
  if (criticalChangesRate > 25) {
    issues.push(`${criticalChangesRate.toFixed(0)}% backup memiliki perubahan kritis`);
    recommendations.push('Review perubahan kritis: user accounts, routing, firewall, AAA');
  }

  // Check for devices never backed up
  const neverBackedUp = await prisma.device.count({
    where: {
      deletedAt: null,
      isDemo: false,
      backupEnabled: true,
      backups: { none: {} },
    },
  });
  if (neverBackedUp > 0) {
    issues.push(`${neverBackedUp} device belum pernah di-backup`);
    recommendations.push('Setup SSH credentials dan jalankan backup manual untuk device baru');
  }

  // Check storage growth
  const storageStats = await prisma.backup.aggregate({
    _sum: { compressedBytes: true },
    _count: true,
    where: { deletedAt: null },
  });
  const storageMB = (storageStats._sum.compressedBytes ?? 0) / 1024 / 1024;
  if (storageMB > 500) {
    issues.push(`Storage backup ${storageMB.toFixed(0)}MB - pertimbangkan tiered storage`);
    recommendations.push('Aktifkan BACKUP_STORAGE_TIERED=true untuk archive ke filesystem');
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    grade,
    issues,
    metrics: {
      deviceCoverage: Math.round(deviceCoverage),
      successRate: Math.round(successRate),
      avgDuration,
      storageEfficiency: Math.round((1 - compressionRatio) * 100),
      criticalChangesRate: Math.round(criticalChangesRate),
    },
    recommendations,
  };
}

export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-amber-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-rose-400';
    default: return 'text-slate-400';
  }
}

export function getGradeBg(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500/10 border-emerald-500/20';
    case 'B': return 'bg-blue-500/10 border-blue-500/20';
    case 'C': return 'bg-amber-500/10 border-amber-500/20';
    case 'D': return 'bg-orange-500/10 border-orange-500/20';
    case 'F': return 'bg-rose-500/10 border-rose-500/20';
    default: return 'bg-slate-500/10 border-slate-500/20';
  }
}