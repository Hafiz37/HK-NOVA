import cron from 'node-cron';
import prisma from '../lib/prisma';
import { executeDueScheduledProvisioning } from '../lib/scheduled-provisioning';

const CRON_SCHEDULE = process.env.SCHEDULED_PROVISIONING_CRON || '* * * * *'; // Every minute by default

console.log(`[Scheduled Provisioning Worker] Starting with schedule: "${CRON_SCHEDULE}"`);

cron.schedule(CRON_SCHEDULE, async () => {
  try {
    const results = await executeDueScheduledProvisioning(prisma);
    if (results.length > 0) {
      console.log(`[Scheduled Provisioning Worker] Executed ${results.length} scheduled jobs`);
    }
  } catch (error) {
    console.error('[Scheduled Provisioning Worker] Error:', error);
  }
});