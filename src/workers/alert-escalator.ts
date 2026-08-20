/**
 * Alert Escalator Worker
 *
 * Menjalankan reminder & tangga eskalasi untuk alert yang masih open
 * (ACTIVE/ACKNOWLEDGED) berdasarkan policy (`alert:policies`):
 *
 *  - level 0 : reminder ulang setiap `renotifyIntervalMinutes`
 *  - level 1..N: setelah `afterMinutes` → severity dinaikkan (minimal ke stage
 *              severity) + notifikasi dikirim ulang + jejak AlertEscalation &
 *              AlertActivity ESCALATED.
 *
 * Interval scheduler: setiap menit (node-cron). Disarankan dijalankan bersama
 * worker lain (lihat ecosystem.config.js).
 */

import { PrismaClient, AlertStatus } from '@prisma/client';
import cron from 'node-cron';
import { dispatchNotifications } from '../lib/notifier';
import { getAlertPolicy, maxSeverity } from '../lib/alert-policy';
import { recordAlertActivity } from '../lib/alert-engine';
import { isDeviceInMaintenance } from '../lib/maintenance';
import { checkCooldown } from '../lib/cooldown';

const prisma = new PrismaClient();
const ESCALATOR_INTERVAL = process.env.ESCALATOR_INTERVAL ?? '* * * * *';

const OPEN: AlertStatus[] = ['ACTIVE', 'ACKNOWLEDGED'];

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [ESCALATOR] [${level}] ${message}${metaStr}`);
}

async function escalateAlert(
  alert: {
    id: string;
    deviceId: string | null;
    message: string;
    severity: string;
    type: string;
    createdAt: Date;
    firstTriggeredAt: Date | null;
  },
  targetLevel: number,
  targetSeverity: string,
  renotifyMs: number
): Promise<void> {
  const device = alert.deviceId
    ? await prisma.device.findUnique({ where: { id: alert.deviceId }, select: { id: true, name: true, ip: true } })
    : null;

  const message = `[Eskalasi L${targetLevel}] ${alert.type} masih open ${alert.message}`;

  try {
    await prisma.$transaction([
      prisma.alert.update({
        where: { id: alert.id },
        data: { escalationLevel: targetLevel, severity: targetSeverity as never },
      }),
      prisma.alertEscalation.create({
        data: { alertId: alert.id, level: targetLevel, details: { severity: targetSeverity } },
      }),
    ]);
  } catch (err) {
    log('ERROR', `Gagal mencatat eskalasi alert ${alert.id}`, err instanceof Error ? err.message : err);
    return;
  }

  await recordAlertActivity(prisma, {
    alertId: alert.id,
    action: 'ESCALATED',
    message: `Eskalasi ke level ${targetLevel} — severity dinaikkan ke ${targetSeverity}`,
    details: { level: targetLevel, severity: targetSeverity },
  });

  await dispatchNotifications(prisma, {
    type: `${alert.type}_ESCALATED`,
    severity: targetSeverity,
    deviceId: device?.id ?? 'system',
    deviceName: device?.name ?? 'System',
    deviceIp: device?.ip,
    message,
    cooldownKey: `escalation:${targetLevel}`,
    cooldownMs: renotifyMs,
    alertId: alert.id,
    timestamp: new Date(),
  });

  log('WARN', `Alert ${alert.id} ${alert.type} eskalasi ke level ${targetLevel} severity=${targetSeverity}`);
}

async function runEscalationCycle(): Promise<void> {
  try {
    const policy = await getAlertPolicy(prisma);
    const now = Date.now();
    const renotifyMs = policy.renotifyIntervalMinutes * 60_000;

    const alerts = await prisma.alert.findMany({
      where: { status: { in: OPEN }, parentId: null },
      select: {
        id: true,
        type: true,
        message: true,
        severity: true,
        escalationLevel: true,
        deviceId: true,
        createdAt: true,
        firstTriggeredAt: true,
      },
    });

    let reminders = 0;
    let escalations = 0;

    for (const alert of alerts) {
      if (alert.deviceId && (await isDeviceInMaintenance(alert.deviceId))) continue;

      const onset = alert.firstTriggeredAt ?? alert.createdAt;
      const elapsedMin = (now - onset.getTime()) / 60_000;

      const stages = policy.escalationStages;
      let targetLevel = 0;
      let targetSeverity = alert.severity;
      for (const stage of stages) {
        if (elapsedMin >= stage.afterMinutes) {
          targetLevel += 1;
          targetSeverity = maxSeverity(targetSeverity, stage.severity);
        }
      }

      if (targetLevel > alert.escalationLevel && targetLevel <= stages.length) {
        await escalateAlert(alert, targetLevel, targetSeverity, renotifyMs);
        escalations += 1;
        continue;
      }

      // Reminder level 0 (masih dalam SLA / belum ada stage terlewat).
      if (targetLevel === 0 && elapsedMin >= policy.renotifyIntervalMinutes) {
        const allowed = await checkCooldown(prisma, {
          deviceId: alert.deviceId ?? 'system',
          channel: 'telegram',
          cooldownKey: `reminder:${alert.id}`,
          cooldownMs: renotifyMs,
        }, now);
        if (!allowed.allowed) continue;

        const device = alert.deviceId
          ? await prisma.device.findUnique({ where: { id: alert.deviceId }, select: { id: true, name: true, ip: true } })
          : null;

        await dispatchNotifications(prisma, {
          type: `${alert.type}_REMINDER`,
          severity: alert.severity,
          deviceId: device?.id ?? 'system',
          deviceName: device?.name ?? 'System',
          deviceIp: device?.ip,
          message: `[Reminder] ${alert.type} masih belum ditangani (${Math.round(elapsedMin)} menit): ${alert.message}`,
          cooldownKey: `reminder:${alert.id}`,
          cooldownMs: renotifyMs,
          alertId: alert.id,
          timestamp: new Date(),
        });
        reminders += 1;
      }
    }

    if (reminders > 0 || escalations > 0) {
      log('INFO', `Cycle selesai: ${escalations} eskalasi, ${reminders} reminder dari ${alerts.length} alert open`);
    } else {
      log('INFO', `Cycle selesai: tidak ada aksi (${alerts.length} alert open)`);
    }
  } catch (err) {
    log('ERROR', 'Escalation cycle gagal', err instanceof Error ? err.message : err);
  }
}

let isRunning = false;

async function scheduled(): Promise<void> {
  if (isRunning) {
    log('WARN', 'Skipping scheduled run — previous cycle masih berjalan');
    return;
  }
  isRunning = true;
  try {
    await runEscalationCycle();
  } finally {
    isRunning = false;
  }
}

let isShuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down...`);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

cron.schedule(ESCALATOR_INTERVAL, () => void scheduled());
log('INFO', `Alert Escalator worker running (cron: ${ESCALATOR_INTERVAL})`);
void scheduled();