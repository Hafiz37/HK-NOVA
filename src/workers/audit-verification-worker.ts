import { verifyAuditChain, sealAuditPeriod } from '@/lib/audit/immutable-log';
import prisma from '@/lib/prisma';

console.log('[AUDIT-VERIFICATION] Starting audit chain verification worker...');

async function runVerification() {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: oneHourAgo, lte: now },
        verified: false,
      },
      orderBy: { sequenceNumber: 'asc' },
      select: { sequenceNumber: true },
    });

    if (logs.length === 0) {
      console.log('[AUDIT-VERIFICATION] No new logs to verify');
      return;
    }

    const startSeq = Number(logs[0].sequenceNumber);
    const endSeq = Number(logs[logs.length - 1].sequenceNumber);

    console.log(`[AUDIT-VERIFICATION] Verifying logs ${startSeq} to ${endSeq} (${logs.length} logs)`);

    const result = await verifyAuditChain(startSeq, endSeq);

    if (result.valid) {
      console.log('[AUDIT-VERIFICATION] Chain verification passed');
      await prisma.auditLog.updateMany({
        where: { sequenceNumber: { gte: startSeq, lte: endSeq } },
        data: { verified: true, verifiedAt: new Date() },
      });
    } else {
      console.error('[AUDIT-VERIFICATION] Chain verification FAILED:', result.errors);
      await prisma.auditLog.updateMany({
        where: { sequenceNumber: { gte: startSeq, lte: endSeq } },
        data: { tampered: true },
      });

      const errorsForJson = result.errors.map(e => ({
        sequence: e.sequence.toString(),
        reason: e.reason,
      }));

      await prisma.securityEvent.create({
        data: {
          eventType: 'audit_tampering_detected',
          severity: 'critical',
          description: `Audit chain verification failed for sequence ${startSeq}-${endSeq}: ${result.errors.length} errors`,
          metadata: { errors: errorsForJson.slice(0, 10) },
        },
      });
    }

    await sealAuditPeriod(oneHourAgo, now);
  } catch (error) {
    console.error('[AUDIT-VERIFICATION] Error:', error);
  }
}

runVerification().then(() => {
  console.log('[AUDIT-VERIFICATION] Worker completed');
  process.exit(0);
}).catch((err) => {
  console.error('[AUDIT-VERIFICATION] Fatal error:', err);
  process.exit(1);
});