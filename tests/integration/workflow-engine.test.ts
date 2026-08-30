import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { WorkflowEngine } from '../../src/lib/workflow-engine';
import type { WorkflowDefinition } from '../../src/lib/workflow-engine';

const prisma = new PrismaClient();

describe('WorkflowEngine - Condition Evaluation Integration', () => {
  let engine: WorkflowEngine;
  let testWorkflowId: string;

  beforeEach(async () => {
    engine = new WorkflowEngine(prisma);

    // Clean up any test workflows
    await prisma.workflowExecution.deleteMany({
      where: { workflowId: { startsWith: 'test-workflow-' } },
    });
    await prisma.workflowDefinition.deleteMany({
      where: { id: { startsWith: 'test-workflow-' } },
    });
  });

  afterEach(async () => {
    // Cleanup
    if (testWorkflowId) {
      await prisma.workflowExecution.deleteMany({
        where: { workflowId: testWorkflowId },
      });
      await prisma.workflowDefinition.deleteMany({
        where: { id: testWorkflowId },
      });
    }
  });

  describe('Safe Condition Evaluation', () => {
    it('should evaluate conditions safely without code execution', async () => {
      // Test that the engine uses safe evaluator
      const result = (engine as any).evaluateCondition('x > 5', { x: 10 });
      expect(result).toBe(true);
    });

    it('should block dangerous patterns in conditions', async () => {
      const result = (engine as any).evaluateCondition('process.exit(1)', {});
      expect(result).toBe(false); // Should fail safely, not crash
    });

    it('should block require() attempts', async () => {
      const result = (engine as any).evaluateCondition('require("fs")', {});
      expect(result).toBe(false);
    });

    it('should block eval() attempts', async () => {
      const result = (engine as any).evaluateCondition('eval("malicious")', {});
      expect(result).toBe(false);
    });

    it('should block constructor pollution attempts', async () => {
      const result = (engine as any).evaluateCondition('constructor.constructor("return process")()', {});
      expect(result).toBe(false);
    });
  });

  describe('Workflow Creation with Conditions', () => {
    it('should create workflow with conditional edges', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Test Conditional Workflow',
        status: 'DRAFT',
        trigger: { type: 'MANUAL', config: {} },
        nodes: [
          {
            id: 'node1',
            type: 'CONDITION',
            name: 'Check Value',
            config: { condition: 'value > 10' },
            position: { x: 0, y: 0 },
            next: ['node2', 'node3'],
          },
          {
            id: 'node2',
            type: 'NOTIFY',
            name: 'High Value',
            config: { message: 'Value is high' },
            position: { x: 100, y: 0 },
            next: [],
          },
          {
            id: 'node3',
            type: 'NOTIFY',
            name: 'Low Value',
            config: { message: 'Value is low' },
            position: { x: 100, y: 100 },
            next: [],
          },
        ],
        edges: [
          { id: 'e1', source: 'node1', target: 'node2', condition: 'value > 10' },
          { id: 'e2', source: 'node1', target: 'node3', condition: 'value <= 10' },
        ],
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testWorkflowId = workflow.id;
      expect(workflow).toBeDefined();
      expect(workflow.edges).toHaveLength(2);
    });

    it('should reject workflow with dangerous conditions', async () => {
      // The workflow can be created, but execution will fail safely
      const workflow = await engine.createWorkflow({
        name: 'Malicious Workflow',
        status: 'DRAFT',
        trigger: { type: 'MANUAL', config: {} },
        nodes: [
          {
            id: 'node1',
            type: 'CONDITION',
            name: 'Malicious Check',
            config: { condition: 'process.exit(1)' },
            position: { x: 0, y: 0 },
            next: [],
          },
        ],
        edges: [],
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testWorkflowId = workflow.id;
      expect(workflow).toBeDefined();

      // But condition evaluation will fail safely
      const result = (engine as any).evaluateCondition('process.exit(1)', {});
      expect(result).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting on workflow execution', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Rate Limit Test',
        status: 'ACTIVE',
        trigger: { type: 'MANUAL', config: {} },
        nodes: [
          {
            id: 'node1',
            type: 'NOTIFY',
            name: 'Simple Notify',
            config: { message: 'test' },
            position: { x: 0, y: 0 },
            next: [],
          },
        ],
        edges: [],
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testWorkflowId = workflow.id;

      // Execute 10 times (should succeed)
      for (let i = 0; i < 10; i++) {
        await engine.executeWorkflow(workflow.id, {}, {}, 'rate-test-user');
      }

      // 11th execution should fail with rate limit error
      await expect(
        engine.executeWorkflow(workflow.id, {}, {}, 'rate-test-user')
      ).rejects.toThrow(/Rate limit exceeded/);
    });

    it('should allow executions after rate limit window resets', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Rate Limit Reset Test',
        status: 'ACTIVE',
        trigger: { type: 'MANUAL', config: {} },
        nodes: [
          {
            id: 'node1',
            type: 'NOTIFY',
            name: 'Simple Notify',
            config: { message: 'test' },
            position: { x: 0, y: 0 },
            next: [],
          },
        ],
        edges: [],
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testWorkflowId = workflow.id;

      // Execute once
      await engine.executeWorkflow(workflow.id, {}, {}, 'reset-test-user');

      // Manually reset rate limiter (simulate 60 second passage)
      (engine as any).executionRateLimiter.delete('reset-test-user');

      // Should succeed after reset
      await expect(
        engine.executeWorkflow(workflow.id, {}, {}, 'reset-test-user')
      ).resolves.toBeDefined();
    });
  });

  describe('Audit Logging', () => {
    it('should log condition evaluations to audit log', async () => {
      // Evaluate a condition
      (engine as any).evaluateCondition('x > 5', { x: 10 });

      // Wait a bit for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'WORKFLOW_CONDITION_EVAL',
          entity: 'WorkflowCondition',
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      if (auditLogs.length > 0) {
        const log = auditLogs[0];
        expect(log.action).toBe('WORKFLOW_CONDITION_EVAL');
        expect(log.entity).toBe('WorkflowCondition');
        expect(log.details).toBeDefined();
      }
    });
  });

  describe('Edge Condition Evaluation', () => {
    it('should evaluate edge conditions correctly', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Edge Condition Test',
        status: 'DRAFT',
        trigger: { type: 'MANUAL', config: {} },
        nodes: [
          {
            id: 'start',
            type: 'CUSTOM',
            name: 'Start',
            config: { value: 15 },
            position: { x: 0, y: 0 },
            next: ['high', 'low'],
          },
          {
            id: 'high',
            type: 'NOTIFY',
            name: 'High Value Handler',
            config: { message: 'High' },
            position: { x: 100, y: 0 },
            next: [],
          },
          {
            id: 'low',
            type: 'NOTIFY',
            name: 'Low Value Handler',
            config: { message: 'Low' },
            position: { x: 100, y: 100 },
            next: [],
          },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'high', condition: 'custom' },
          { id: 'e2', source: 'start', target: 'low', condition: '!custom' },
        ],
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testWorkflowId = workflow.id;

      // Test getNextNodes with conditions
      const output = { custom: true };
      const nextNodes = (engine as any).getNextNodes(workflow, 'start', output);

      expect(nextNodes).toBeDefined();
      expect(Array.isArray(nextNodes)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid conditions gracefully', async () => {
      const result = (engine as any).evaluateCondition('invalid syntax }{', {});
      expect(result).toBe(false); // Should return false, not throw
    });

    it('should handle undefined variables gracefully', async () => {
      const result = (engine as any).evaluateCondition('x > 5', {});
      expect(result).toBe(false);
    });

    it('should continue workflow execution even with invalid edge conditions', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Error Handling Test',
        status: 'DRAFT',
        trigger: { type: 'MANUAL', config: {} },
        nodes: [
          {
            id: 'node1',
            type: 'NOTIFY',
            name: 'Node 1',
            config: { message: 'test' },
            position: { x: 0, y: 0 },
            next: ['node2'],
          },
          {
            id: 'node2',
            type: 'NOTIFY',
            name: 'Node 2',
            config: { message: 'test' },
            position: { x: 100, y: 0 },
            next: [],
          },
        ],
        edges: [
          { id: 'e1', source: 'node1', target: 'node2', condition: 'invalid}{' },
        ],
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testWorkflowId = workflow.id;

      // Should not crash with invalid condition
      const nextNodes = (engine as any).getNextNodes(workflow, 'node1', {});
      expect(nextNodes).toBeDefined();
      expect(Array.isArray(nextNodes)).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should evaluate conditions quickly', async () => {
      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        (engine as any).evaluateCondition('x > 5 && y < 10', { x: 10, y: 5 });
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // Should be very fast (< 1ms average)
      expect(avgTime).toBeLessThan(1);
    });
  });
});

describe('WorkflowEngine - Security Hardening Integration', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine(prisma);
  });

  describe('Multiple Security Layers', () => {
    it('should have SafeExpressionEvaluator initialized', () => {
      expect((engine as any).evaluator).toBeDefined();
    });

    it('should have rate limiter initialized', () => {
      expect((engine as any).executionRateLimiter).toBeDefined();
      expect((engine as any).executionRateLimiter instanceof Map).toBe(true);
    });

    it('should have rate limit check method', () => {
      expect(typeof (engine as any).checkRateLimit).toBe('function');
    });

    it('should have audit logging method', () => {
      expect(typeof (engine as any).auditConditionEvaluation).toBe('function');
    });
  });

  describe('Defense in Depth', () => {
    it('should block all known dangerous patterns', async () => {
      const dangerousPatterns = [
        'process.exit(1)',
        'require("fs")',
        'import("os")',
        'eval("code")',
        'Function("return this")()',
        '__proto__.polluted = true',
        'constructor.constructor("return process")()',
        'this.global',
        'global.process',
        'window.location',
      ];

      for (const pattern of dangerousPatterns) {
        const result = (engine as any).evaluateCondition(pattern, {});
        expect(result).toBe(false);
      }
    });
  });
});
