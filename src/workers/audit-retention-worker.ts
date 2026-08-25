import { archiveOldLogs, cleanupExpired, RETENTION_POLICIES } from '@/lib/audit/retention';
import prisma from '@/lib/prisma';

console.log('[AUDIT-RETENTION] Starting audit retention worker...');

async function runRetention() {
  try {
    console.log('[AUDIT-RETENTION] Checking retention policies...');

    for (const [policyName, policy] of Object.entries(RETENTION_POLICIES)) {
      const archiveAfter = new Date(Date.now() - policy.archiveAfterDays * 24 * 60 * 60 * 1000);

      const count = await prisma.auditLog.count({
        where: {
          retentionPolicy: policyName,
          isArchived: false,
          createdAt: { lt: archiveAfter },
        },
      });

      if (count > 0) {
        console.log(`[AUDIT-RETENTION] Archiving ${count} logs for policy "${policyName}" (older than ${policy.archiveAfterDays} days)`);
        const result = await archiveOldLogs(archiveAfter);
        console.log(`[AUDIT-RETENTION] Archived ${result.archived} logs to archive ${result.archiveId}`);
      }
    }

    console.log('[AUDIT-RETENTION] Cleaning up expired archived logs...');
    const cleanup = await cleanupExpired();
    console.log(`[AUDIT-RETENTION] Deleted ${cleanup.deleted} expired logs`);
  } catch (error) {
    console.error('[AUDIT-RETENTION] Error:', error);
  }
}

runRetention().then(() => {
  console.log('[AUDIT-RETENTION] Worker completed');
  process.exit(0);
}).catch((err) => {
  console.error('[AUDIT-RETENTION] Fatal error:', err);
  process.exit(1);
});