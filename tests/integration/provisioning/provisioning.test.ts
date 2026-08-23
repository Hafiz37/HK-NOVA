import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { executeProvisioning } from '@/lib/provisioning';
import { executeBatchProvisioning } from '@/lib/batch-provisioning';
import { executeMultiDeviceProvisioning } from '@/lib/multi-device-provisioning';
import { createScheduledProvisioning, executeDueScheduledProvisioning } from '@/lib/scheduled-provisioning';
import { createProvisioningRequest, reviewProvisioningRequest } from '@/lib/approval-workflow';
import { executeRollback } from '@/lib/rollback';
import { validateAllTemplates } from '@/lib/template-validator';
import { runTestSuite } from '@/lib/template-playground';
import { getProvisioningAnalytics } from '@/lib/provisioning-analytics';
import type { TemplateName } from '@/lib/olt-templates';

const prisma = new PrismaClient();

describe('Provisioning Integration Tests', () => {
  let testDeviceId: string;
  let testUserId: string;
  let testTemplate: TemplateName;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.upsert({
      where: { username: 'testuser' },
      update: { role: 'ADMIN' },
      create: {
        username: 'testuser',
        passwordHash: '$2a$10$test',
        email: 'test@hknova.local',
        fullName: 'Test User',
        role: 'ADMIN',
      },
    });
    testUserId = user.id;

    // Enable feature flag for testing
    await prisma.featureFlag.upsert({
      where: { key: 'PROVISIONING_EXECUTE_ENABLED' },
      update: { enabled: true, scope: 'GLOBAL', updatedBy: testUserId },
      create: { key: 'PROVISIONING_EXECUTE_ENABLED', enabled: true, scope: 'GLOBAL', updatedBy: testUserId },
    });

    // Create test device - use upsert to avoid conflicts
    const device = await prisma.device.upsert({
      where: { ip: '10.10.10.10' },
      update: {},
      create: {
        name: 'Test OLT',
        ip: '10.10.10.10',
        type: 'OLT',
        vendor: 'Huawei',
        model: 'MA5800',
        location: 'Test Lab',
        status: 'UNKNOWN',
      },
    });
    testDeviceId = device.id;
    testTemplate = 'huawei';

    // Add SSH credentials for testing
    await prisma.credential.upsert({
      where: { deviceId: testDeviceId },
      update: {},
      create: {
        deviceId: testDeviceId,
        sshUsername: 'admin',
        sshPassword: 'test123',
        sshPort: 22,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.provisioningLog.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.provisioningRequest.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.batchProvisioning.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.scheduledProvisioning.deleteMany({ where: { deviceId: testDeviceId } });
    // Device might have been deleted in multi-device test
    await prisma.device.deleteMany({ where: { id: testDeviceId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean provisioning logs before each test
    await prisma.provisioningLog.deleteMany({ where: { deviceId: testDeviceId } });
  });

  describe('Template Validation', () => {
    it('should validate all built-in templates', () => {
      const results = validateAllTemplates();
      expect(results.huawei.valid).toBe(true);
      expect(results.zte.valid).toBe(true);
      expect(results.generic.valid).toBe(true);
    });

    it('should run default test suite', () => {
      const result = runTestSuite();
      expect(result.totalTests).toBeGreaterThan(0);
      expect(result.passCount).toBeGreaterThan(0);
    });
  });

  describe('Dry-run Mode', () => {
    it('should execute dry-run without SSH', async () => {
      const result = await executeProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '1',
          ontSerial: 'HWTC12345678',
          vlan: 100,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '1',
        },
        executedBy: testUserId,
        dryRun: true,
      });

      console.log('Dry-run result:', JSON.stringify(result, null, 2));
      expect(result.ok).toBe(true);
      expect(result.log?.executionMode).toBe('DRY_RUN');
      expect(result.log?.status).toBe('DRY_RUN');
      expect(result.log?.response).toContain('DRY-RUN MODE');
    });

    it('should validate required fields in dry-run', async () => {
      const result = await executeProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {}, // Missing required fields
        executedBy: testUserId,
        dryRun: true,
      });

      expect(result.ok).toBe(false);
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Provisioning', () => {
    it('should execute batch provisioning sequentially', async () => {
      const result = await executeBatchProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        items: [
          {
            ponPort: '0/1',
            ontSlot: '1',
            ontSerial: 'HWTC11111111',
            vlan: 100,
            serviceProfile: '10',
            lineProfile: '20',
            servicePort: '1',
          },
          {
            ponPort: '0/1',
            ontSlot: '2',
            ontSerial: 'HWTC22222222',
            vlan: 101,
            serviceProfile: '10',
            lineProfile: '20',
            servicePort: '2',
          },
        ],
        executedBy: testUserId,
        dryRun: true,
        continueOnError: true,
        parallelExecution: false,
      });

      expect(result.ok).toBe(true);
      expect(result.totalItems).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.results.length).toBe(2);
    });

    it('should continue on error when continueOnError is true', async () => {
      const result = await executeBatchProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        items: [
          {
            ponPort: '0/1',
            ontSlot: '1',
            ontSerial: 'HWTC11111111',
            vlan: 100,
            serviceProfile: '10',
            lineProfile: '20',
            servicePort: '1',
          },
          {
            // Missing required fields - should fail but continue
            ponPort: '0/1',
          },
        ],
        executedBy: testUserId,
        dryRun: true,
        continueOnError: true,
      });

      expect(result.ok).toBe(true);
      expect(result.totalItems).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('Scheduled Provisioning', () => {
    it('should create scheduled provisioning job', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      const job = await createScheduledProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '1',
          ontSerial: 'HWTC99999999',
          vlan: 200,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '1',
        },
        scheduledAt: futureDate,
        createdBy: testUserId,
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('PENDING');
      expect(job.scheduledAt).toEqual(futureDate);
    });

    it('should execute due scheduled jobs', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 5);

      await createScheduledProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '10',
          ontSerial: 'HWTC88888888',
          vlan: 300,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '10',
        },
        scheduledAt: pastDate,
        createdBy: testUserId,
      });

      // Use dryRun for test to avoid SSH connection
      const results = await executeDueScheduledProvisioning(prisma, true);
      console.log('Scheduled results:', JSON.stringify(results, null, 2));
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].result.ok).toBe(true);
    });
  });

  describe('Approval Workflow', () => {
    it('should create provisioning request', async () => {
      const request = await createProvisioningRequest(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '5',
          ontSerial: 'HWTC77777777',
          vlan: 400,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '5',
        },
        requestedBy: testUserId,
      });

      expect(request.id).toBeDefined();
      expect(request.status).toBe('PENDING');
    });

    it('should approve and execute request (dry-run)', async () => {
      const request = await createProvisioningRequest(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '6',
          ontSerial: 'HWTC66666666',
          vlan: 500,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '6',
        },
        requestedBy: testUserId,
      });

      const approved = await reviewProvisioningRequest(prisma, request.id, testUserId, true, undefined, true);
      expect(approved.status).toBe('APPROVED');
      expect(approved.logId).toBeDefined();
    });

    it('should reject request', async () => {
      const request = await createProvisioningRequest(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '7',
          ontSerial: 'HWTC55555555',
          vlan: 600,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '7',
        },
        requestedBy: testUserId,
      });

      const rejected = await reviewProvisioningRequest(prisma, request.id, testUserId, false, 'Test rejection');
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('Test rejection');
    });
  });

  describe('Rollback Mechanism', () => {
    it('should rollback create_service to terminate_service', async () => {
      // First create a provisioning log
      const original = await executeProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '8',
          ontSerial: 'HWTC44444444',
          vlan: 700,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '8',
        },
        executedBy: testUserId,
        dryRun: true,
      });

      expect(original.ok).toBe(true);
      expect(original.log?.action).toBe('CREATE');

      // Rollback
      const rollback = await executeRollback(prisma, original.log!.id, testUserId, true);
      console.log('Rollback result:', JSON.stringify(rollback, null, 2));
      expect(rollback.ok).toBe(true);
      expect(rollback.rollbackLogId).toBeDefined();

      // Verify rollback log
      const rollbackLog = await prisma.provisioningLog.findUnique({
        where: { id: rollback.rollbackLogId! },
      });
      expect(rollbackLog?.isRollback).toBe(true);
      expect(rollbackLog?.action).toBe('TERMINATE');
    });
  });

  describe('Analytics', () => {
    it('should return provisioning analytics', async () => {
      const stats = await getProvisioningAnalytics(prisma, 30);
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.vendorStats).toBeInstanceOf(Array);
      expect(stats.actionStats).toBeInstanceOf(Array);
      expect(stats.recentTrend).toBeInstanceOf(Array);
    });
  });

  describe('Multi-device Provisioning', () => {
    it('should execute on multiple devices', async () => {
      // Create second test device
      const device2 = await prisma.device.create({
        data: {
          name: 'Test OLT 2',
          ip: '10.10.10.11',
          type: 'OLT',
          vendor: 'Huawei',
          model: 'MA5800',
          location: 'Test Lab',
          status: 'UNKNOWN',
        },
      });

      const result = await executeMultiDeviceProvisioning(prisma, {
        deviceIds: [testDeviceId, device2.id],
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '9',
          ontSerial: 'HWTC33333333',
          vlan: 800,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '9',
        },
        executedBy: testUserId,
        dryRun: true,
        parallelExecution: true,
      });

      expect(result.ok).toBe(true);
      expect(result.totalDevices).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.deviceResults.length).toBe(2);

      await prisma.device.delete({ where: { id: device2.id } });
    });
  });

  describe('Feature Flags', () => {
    it('should enforce feature flag for execution', async () => {
      // Disable global flag
      await prisma.featureFlag.upsert({
        where: { key: 'PROVISIONING_EXECUTE_ENABLED' },
        update: { enabled: false, scope: 'GLOBAL', updatedBy: testUserId },
        create: { key: 'PROVISIONING_EXECUTE_ENABLED', enabled: false, scope: 'GLOBAL', updatedBy: testUserId },
      });

      const result = await executeProvisioning(prisma, {
        deviceId: testDeviceId,
        action: 'create_service',
        template: testTemplate,
        fields: {
          ponPort: '0/1',
          ontSlot: '20',
          ontSerial: 'HWTC10101010',
          vlan: 900,
          serviceProfile: '10',
          lineProfile: '20',
          servicePort: '20',
        },
        executedBy: testUserId,
        dryRun: false, // Try real execution
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('feature flag');

      // Re-enable
      await prisma.featureFlag.update({
        where: { key: 'PROVISIONING_EXECUTE_ENABLED' },
        data: { enabled: true, updatedBy: testUserId },
      });
    });
  });
});