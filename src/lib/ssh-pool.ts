import { Client, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'events';
import {
  sshPoolConnectionsCreated,
  sshPoolConnectionsReused,
  sshPoolConnectionsDestroyed,
  updateSSHPoolMetrics,
} from './metrics';

interface PooledSSHConnection {
  client: Client;
  deviceId: string;
  createdAt: number;
  lastUsed: number;
  inUse: boolean;
  usageCount: number;
}

interface SSHPoolConfig {
  maxConnectionsPerDevice: number;
  maxIdleTimeMs: number;
  maxConnectionLifetimeMs: number;
  maxUsageCount: number;
  cleanupIntervalMs: number;
}

export class SSHConnectionPool extends EventEmitter {
  private pools: Map<string, PooledSSHConnection[]> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private metrics = {
    totalCreated: 0,
    totalReused: 0,
    totalDestroyed: 0,
    activeConnections: 0,
  };
  
  constructor(private config: SSHPoolConfig) {
    super();
    this.startCleanup();
  }
  
  async acquire(
    deviceId: string,
    connectConfig: ConnectConfig
  ): Promise<Client> {
    const devicePool = this.pools.get(deviceId) || [];
    
    const idle = devicePool.find(conn => !conn.inUse && this.isConnectionHealthy(conn));
    
    if (idle) {
      idle.inUse = true;
      idle.lastUsed = Date.now();
      idle.usageCount++;
      this.metrics.totalReused++;
      sshPoolConnectionsReused.inc();
      
      this.emit('connection:reused', { deviceId, usageCount: idle.usageCount });
      return idle.client;
    }
    
    if (devicePool.length >= this.config.maxConnectionsPerDevice) {
      throw new Error(
        `SSH pool exhausted for device ${deviceId} ` +
        `(max: ${this.config.maxConnectionsPerDevice})`
      );
    }
    
    const client = await this.createConnection(connectConfig);
    const pooled: PooledSSHConnection = {
      client,
      deviceId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      inUse: true,
      usageCount: 1,
    };
    
    devicePool.push(pooled);
    this.pools.set(deviceId, devicePool);
    
    this.metrics.totalCreated++;
    this.metrics.activeConnections++;
    sshPoolConnectionsCreated.inc();
    
    this.emit('connection:created', { deviceId, poolSize: devicePool.length });
    return client;
  }
  
  release(deviceId: string, client: Client): void {
    const devicePool = this.pools.get(deviceId);
    if (!devicePool) return;
    
    const conn = devicePool.find(c => c.client === client);
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
      this.emit('connection:released', { deviceId, usageCount: conn.usageCount });
    }
  }
  
  async destroy(deviceId: string, client: Client): Promise<void> {
    const devicePool = this.pools.get(deviceId);
    if (!devicePool) return;
    
    const index = devicePool.findIndex(c => c.client === client);
    if (index >= 0) {
      const conn = devicePool[index];
      conn.client.end();
      devicePool.splice(index, 1);
      
      this.metrics.totalDestroyed++;
      this.metrics.activeConnections--;
      sshPoolConnectionsDestroyed.inc();
      
      if (devicePool.length === 0) {
        this.pools.delete(deviceId);
      }
      
      this.emit('connection:destroyed', { deviceId, reason: 'manual' });
    }
  }
  
  private async createConnection(config: ConnectConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH connection timeout'));
      }, config.readyTimeout || 15000);
      
      client.once('ready', () => {
        clearTimeout(timeout);
        resolve(client);
      });
      
      client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      client.connect(config);
    });
  }
  
  private isConnectionHealthy(conn: PooledSSHConnection): boolean {
    const now = Date.now();
    
    if (now - conn.lastUsed > this.config.maxIdleTimeMs) {
      return false;
    }
    
    if (now - conn.createdAt > this.config.maxConnectionLifetimeMs) {
      return false;
    }
    
    if (conn.usageCount >= this.config.maxUsageCount) {
      return false;
    }
    
    return true;
  }
  
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }
  
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    const deviceIds = Array.from(this.pools.keys());
    
    for (const deviceId of deviceIds) {
      const devicePool = this.pools.get(deviceId);
      if (!devicePool) continue;
      
      const toRemove: number[] = [];
      
      devicePool.forEach((conn, index) => {
        if (!conn.inUse && !this.isConnectionHealthy(conn)) {
          conn.client.end();
          toRemove.push(index);
          cleaned++;
        }
      });
      
      for (let i = toRemove.length - 1; i >= 0; i--) {
        devicePool.splice(toRemove[i], 1);
      }
      
      if (devicePool.length === 0) {
        this.pools.delete(deviceId);
      }
    }
    
    if (cleaned > 0) {
      this.metrics.totalDestroyed += cleaned;
      this.metrics.activeConnections -= cleaned;
      sshPoolConnectionsDestroyed.inc(cleaned);
      this.emit('cleanup:completed', { cleaned, remaining: this.metrics.activeConnections });
    }
    
    updateSSHPoolMetrics(this.getMetrics());
  }
  
  getMetrics() {
    const connectionsPerDevice: Array<{
      deviceId: string;
      total: number;
      inUse: number;
      idle: number;
    }> = [];
    
    this.pools.forEach((pool, deviceId) => {
      connectionsPerDevice.push({
        deviceId,
        total: pool.length,
        inUse: pool.filter(c => c.inUse).length,
        idle: pool.filter(c => !c.inUse).length,
      });
    });
    
    return {
      ...this.metrics,
      poolsCount: this.pools.size,
      connectionsPerDevice,
    };
  }
  
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.pools.forEach((devicePool) => {
      devicePool.forEach((conn) => {
        conn.client.end();
      });
    });
    
    this.pools.clear();
    this.emit('shutdown');
  }
}

export const sshPool = new SSHConnectionPool({
  maxConnectionsPerDevice: 2,
  maxIdleTimeMs: 60_000,
  maxConnectionLifetimeMs: 600_000,
  maxUsageCount: 50,
  cleanupIntervalMs: 30_000,
});
