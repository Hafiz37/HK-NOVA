import pLimit from 'p-limit';

interface QueueItem<T> {
  id: string;
  fn: () => Promise<T>;
  priority: number;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  createdAt: number;
  metadata?: Record<string, any>;
}

interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  avgWaitTime: number;
  avgProcessingTime: number;
}

export class PriorityQueue<T = any> {
  private queue: QueueItem<T>[] = [];
  private active = 0;
  private completed = 0;
  private failed = 0;
  private waitTimes: number[] = [];
  private processingTimes: number[] = [];
  private limiter: ReturnType<typeof pLimit>;
  
  constructor(private concurrency: number) {
    this.limiter = pLimit(concurrency);
  }
  
  async add(
    id: string,
    fn: () => Promise<T>,
    priority = 0,
    metadata?: Record<string, any>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        id,
        fn,
        priority,
        resolve,
        reject,
        createdAt: Date.now(),
        metadata,
      };
      
      // Insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex(q => q.priority < priority);
      
      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }
      
      this.processNext();
    });
  }
  
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    
    const item = this.queue.shift();
    if (!item) return;
    
    const waitTime = Date.now() - item.createdAt;
    this.waitTimes.push(waitTime);
    
    this.limiter(async () => {
      this.active++;
      const startTime = Date.now();
      
      try {
        const result = await item.fn();
        const processingTime = Date.now() - startTime;
        
        this.processingTimes.push(processingTime);
        this.completed++;
        this.active--;
        
        item.resolve(result);
      } catch (error) {
        this.failed++;
        this.active--;
        item.reject(error);
      }
      
      // Keep only last 1000 measurements
      if (this.waitTimes.length > 1000) {
        this.waitTimes = this.waitTimes.slice(-1000);
      }
      if (this.processingTimes.length > 1000) {
        this.processingTimes = this.processingTimes.slice(-1000);
      }
    });
  }
  
  getStats(): QueueStats {
    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;
    
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
      : 0;
    
    return {
      pending: this.queue.length,
      active: this.active,
      completed: this.completed,
      failed: this.failed,
      avgWaitTime,
      avgProcessingTime,
    };
  }
  
  clear(): void {
    this.queue = [];
  }
  
  size(): number {
    return this.queue.length;
  }
}

// Device operation queue
export const deviceOperationQueue = new PriorityQueue(10);

// Discovery queue (lower concurrency for SSH operations)
export const discoveryQueue = new PriorityQueue(5);

// Configuration queue
export const configQueue = new PriorityQueue(3);

// Metrics collection queue
export const metricsQueue = new PriorityQueue(20);
