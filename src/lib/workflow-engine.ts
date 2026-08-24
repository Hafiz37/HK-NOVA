import { PrismaClient } from '@prisma/client';

export type WorkflowStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'ARCHIVED';
export type TriggerType = 'EVENT' | 'SCHEDULE' | 'WEBHOOK' | 'MANUAL' | 'CONDITION';
export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'NOTIFY' | 'WEBHOOK' | 'CUSTOM' | 'DELAY' | 'CONDITION' | 'LOOP';

export interface WorkflowNode {
  id: string;
  type: ActionType;
  name: string;
  description?: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  next: string[]; // next node IDs
  retryPolicy?: {
    maxRetries: number;
    delayMs: number;
    backoffMultiplier?: number;
  };
  timeoutMs?: number;
  continueOnError?: boolean;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string; // expression to evaluate
  label?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  status: WorkflowStatus;
  trigger: {
    type: TriggerType;
    config: Record<string, any>;
  };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, any>;
  settings?: {
    timeoutMs?: number;
    maxConcurrentRuns?: number;
    retryPolicy?: {
      maxRetries: number;
      delayMs: number;
    };
  };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  triggerData?: Record<string, any>;
  variables: Record<string, any>;
  currentNodeId?: string;
  completedNodes: string[];
  failedNodeId?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface WorkflowStepExecution {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: ActionType;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  retryCount: number;
}

export interface WorkflowExecutionQueryOptions {
  workflowId?: string;
  status?: string;
  createdBy?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class WorkflowEngine {
  private prisma: PrismaClient;
  private runningExecutions: Map<string, { abortController: AbortController; startTime: number }> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createWorkflow(definition: Omit<WorkflowDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<WorkflowDefinition> {
    const workflow = await this.prisma.workflowDefinition.create({
      data: {
        ...definition,
        version: 1,
        status: definition.status || 'DRAFT',
      },
    });
    return workflow as WorkflowDefinition;
  }

  async updateWorkflow(id: string, updates: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    const workflow = await this.prisma.workflowDefinition.findUnique({ where: { id } });
    if (!workflow) throw new Error('Workflow not found');

    const updated = await this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        ...updates,
        version: workflow.version + 1,
        updatedBy: updates.updatedBy || 'system',
      },
    });
    return updated as WorkflowDefinition;
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition | null> {
    return this.prisma.workflowDefinition.findUnique({ where: { id } }) as Promise<WorkflowDefinition | null>;
  }

  async getWorkflows(
    status?: WorkflowStatus,
    createdBy?: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<WorkflowDefinition>> {
    const where: any = {};
    if (status) where.status = status;
    if (createdBy) where.createdBy = createdBy;

    const [workflows, total] = await Promise.all([
      this.prisma.workflowDefinition.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workflowDefinition.count({ where }),
    ]);

    return { data: workflows as WorkflowDefinition[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async publishWorkflow(id: string, publishedBy: string): Promise<WorkflowDefinition> {
    return this.updateWorkflow(id, { status: 'ACTIVE', updatedBy: publishedBy, publishedAt: new Date() });
  }

  async archiveWorkflow(id: string, archivedBy: string): Promise<WorkflowDefinition> {
    return this.updateWorkflow(id, { status: 'ARCHIVED', updatedBy: archivedBy });
  }

  async executeWorkflow(
    workflowId: string,
    triggerData: Record<string, any> = {},
    variables: Record<string, any> = {},
    executedBy: string = 'system'
  ): Promise<WorkflowExecution> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.status !== 'ACTIVE') throw new Error('Workflow is not active');

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workflowId,
        workflowVersion: workflow.version,
        status: 'RUNNING',
        triggerData,
        variables: { ...workflow.variables, ...variables },
        startedAt: new Date(),
      },
    });

    const abortController = new AbortController();
    this.runningExecutions.set(execution.id, { abortController, startTime: Date.now() });

    this.executeWorkflowAsync(execution.id, workflow, abortController.signal);

    return execution as WorkflowExecution;
  }

  private async executeWorkflowAsync(
    executionId: string,
    workflow: WorkflowDefinition,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const entryNodes = this.findEntryNodes(workflow);
      
      for (const node of entryNodes) {
        if (signal.aborted) break;
        await this.executeNode(executionId, workflow, node, signal);
      }

      if (!signal.aborted) {
        await this.completeExecution(executionId, 'COMPLETED');
      }
    } catch (error) {
      if (!signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.completeExecution(executionId, 'FAILED', errorMessage);
      }
    } finally {
      this.runningExecutions.delete(executionId);
    }
  }

  private findEntryNodes(workflow: WorkflowDefinition): WorkflowNode[] {
    const targetIds = new Set(workflow.edges.map(e => e.target));
    return workflow.nodes.filter(node => !targetIds.has(node.id));
  }

  private async executeNode(
    executionId: string,
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    signal: AbortSignal,
    variables: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    const stepExecution = await this.prisma.workflowStepExecution.create({
      data: {
        executionId,
        nodeId: node.id,
        nodeType: node.type,
        status: 'RUNNING',
        input: variables,
        startedAt: new Date(),
        retryCount: 0,
      },
    });

    if (signal.aborted) {
      await this.updateStepExecution(stepExecution.id, 'FAILED', { error: 'Execution aborted' });
      throw new Error('Execution aborted');
    }

    try {
      const output = await this.executeNodeLogic(node, variables, signal);
      
      await this.updateStepExecution(stepExecution.id, 'COMPLETED', { output });
      
      const nextNodes = this.getNextNodes(workflow, node.id, output);
      for (const nextNode of nextNodes) {
        if (signal.aborted) break;
        await this.executeNode(executionId, workflow, nextNode, signal, { ...variables, ...output });
      }

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.updateStepExecution(stepExecution.id, 'FAILED', { error: errorMessage });
      
      if (!node.continueOnError) {
        throw error;
      }
      
      return {};
    }
  }

  private async executeNodeLogic(
    node: WorkflowNode,
    variables: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    switch (node.type) {
      case 'CREATE':
        return this.executeCreate(node.config, variables);
      case 'UPDATE':
        return this.executeUpdate(node.config, variables);
      case 'DELETE':
        return this.executeDelete(node.config, variables);
      case 'NOTIFY':
        return this.executeNotify(node.config, variables);
      case 'WEBHOOK':
        return this.executeWebhook(node.config, variables);
      case 'CUSTOM':
        return this.executeCustom(node.config, variables);
      case 'DELAY':
        return this.executeDelay(node.config, signal);
      case 'CONDITION':
        return this.executeCondition(node.config, variables);
      case 'LOOP':
        return this.executeLoop(node.config, variables, signal);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private async executeCreate(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    return { created: true, entityType: config.entityType, data: this.resolveVariables(config.data, variables) };
  }

  private async executeUpdate(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    return { updated: true, entityType: config.entityType, entityId: config.entityId, data: this.resolveVariables(config.data, variables) };
  }

  private async executeDelete(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    return { deleted: true, entityType: config.entityType, entityId: config.entityId };
  }

  private async executeNotify(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    return { notified: true, channel: config.channel, message: this.resolveVariables(config.message, variables) };
  }

  private async executeWebhook(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    const url = this.resolveVariables(config.url, variables);
    const method = config.method || 'POST';
    const headers = this.resolveVariables(config.headers || {}, variables);
    const body = this.resolveVariables(config.body || {}, variables);

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs || 30000),
    });

    return { webhook: true, status: response.status, response: await response.json().catch(() => response.text()) };
  }

  private async executeCustom(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    return { custom: true, result: this.resolveVariables(config, variables) };
  }

  private async executeDelay(config: Record<string, any>, signal: AbortSignal): Promise<Record<string, any>> {
    const ms = config.ms || 1000;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
      });
    });
    return { delayed: true, ms };
  }

  private async executeCondition(config: Record<string, any>, variables: Record<string, any>): Promise<Record<string, any>> {
    const condition = config.condition;
    const result = this.evaluateCondition(condition, variables);
    return { conditionResult: result, branch: result ? 'true' : 'false' };
  }

  private async executeLoop(config: Record<string, any>, variables: Record<string, any>, signal: AbortSignal): Promise<Record<string, any>> {
    const items = this.resolveVariables(config.items, variables) as any[];
    const body = config.body as WorkflowNode[];
    const results = [];

    for (const item of items) {
      if (signal.aborted) break;
      const itemVariables = { ...variables, item, index: items.indexOf(item) };
      
      for (const node of body) {
        if (signal.aborted) break;
        await this.executeNodeLogic(node, { ...itemVariables, ...(await this.executeNodeLogic({...config, type: node.type, config: node.config} as WorkflowNode, itemVariables, signal)) }, signal);
      }
      results.push(item);
    }

    return { loop: true, iterations: items.length, results };
  }

  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      const func = new Function('vars', `with (vars) { return ${condition}; }`);
      return Boolean(func(variables));
    } catch {
      return false;
    }
  }

  private resolveVariables(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return obj.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveVariables(item, variables));
    }
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveVariables(value, variables);
      }
      return result;
    }
    return obj;
  }

  private getNextNodes(workflow: WorkflowDefinition, nodeId: string, output: Record<string, any>): WorkflowNode[] {
    const edges = workflow.edges.filter(e => e.source === nodeId);
    const nextNodes: WorkflowNode[] = [];

    for (const edge of edges) {
      if (edge.condition) {
        const shouldProceed = this.evaluateCondition(edge.condition, output);
        if (!shouldProceed) continue;
      }
      const nextNode = workflow.nodes.find(n => n.id === edge.target);
      if (nextNode) nextNodes.push(nextNode);
    }

    return nextNodes;
  }

  private async updateStepExecution(
    stepId: string,
    status: 'COMPLETED' | 'FAILED' | 'SKIPPED',
    data: { output?: Record<string, any>; error?: string }
  ): Promise<void> {
    const updateData: any = { status, completedAt: new Date() };
    if (data.output) updateData.output = data.output;
    if (data.error) updateData.error = data.error;

    await this.prisma.workflowStepExecution.update({
      where: { id: stepId },
      data: updateData,
    });
  }

  private async completeExecution(executionId: string, status: 'COMPLETED' | 'FAILED', error?: string): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status,
        completedAt: new Date(),
        durationMs: Date.now() - (await this.getExecutionStartTime(executionId)),
        error,
      },
    });
  }

  private async getExecutionStartTime(executionId: string): Promise<number> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      select: { startedAt: true },
    });
    return execution?.startedAt.getTime() ?? Date.now();
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    return this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { steps: { orderBy: { startedAt: 'asc' } } },
    }) as Promise<WorkflowExecution | null>;
  }

  async getExecutions(options: WorkflowExecutionQueryOptions = {}): Promise<PaginatedResult<WorkflowExecution>> {
    const { workflowId, status, createdBy, startDate, endDate, page = 1, limit = 20, sortBy = 'startedAt', sortOrder = 'desc' } = options;

    const where: any = {};
    if (workflowId) where.workflowId = workflowId;
    if (status) where.status = status;
    if (createdBy) where.createdBy = createdBy;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }

    const [executions, total] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: { steps: { orderBy: { startedAt: 'asc' } } },
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return { data: executions as WorkflowExecution[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async cancelExecution(executionId: string): Promise<void> {
    const running = this.runningExecutions.get(executionId);
    if (running) {
      running.abortController.abort();
      this.runningExecutions.delete(executionId);
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  async pauseExecution(executionId: string): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'PAUSED' },
    });
  }

  async resumeExecution(executionId: string): Promise<void> {
    const execution = await this.getExecution(executionId);
    if (!execution || execution.status !== 'PAUSED') throw new Error('Execution not paused');

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING' },
    });

    const workflow = await this.getWorkflow(execution.workflowId);
    if (!workflow) throw new Error('Workflow not found');

    const abortController = new AbortController();
    this.runningExecutions.set(executionId, { abortController, startTime: Date.now() });
    this.executeWorkflowAsync(executionId, workflow, abortController.signal);
  }

  async getWorkflowStats(workflowId: string): Promise<{
    totalRuns: number;
    successful: number;
    failed: number;
    avgDurationMs: number;
    lastRunAt: Date | null;
  }> {
    const executions = await this.prisma.workflowExecution.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });

    const totalRuns = executions.length;
    const successful = executions.filter(e => e.status === 'COMPLETED').length;
    const failed = executions.filter(e => e.status === 'FAILED').length;
    const completed = executions.filter(e => e.durationMs !== null);
    const avgDurationMs = completed.length > 0
      ? completed.reduce((sum, e) => sum + (e.durationMs || 0), 0) / completed.length
      : 0;
    const lastRunAt = executions.length > 0 ? executions[0].startedAt : null;

    return { totalRuns, successful, failed, avgDurationMs, lastRunAt };
  }
}

export function createWorkflowEngine(prisma: PrismaClient): WorkflowEngine {
  return new WorkflowEngine(prisma);
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}