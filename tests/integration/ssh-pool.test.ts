import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSHConnectionPool } from '../../src/lib/ssh-pool';
import { Client } from 'ssh2';

vi.mock('ssh2');

describe('SSHConnectionPool', () => {
  let pool: SSHConnectionPool;
  
  beforeEach(() => {
    pool = new SSHConnectionPool({
      maxConnectionsPerDevice: 2,
      maxIdleTimeMs: 5000,
      maxConnectionLifetimeMs: 10000,
      maxUsageCount: 5,
      cleanupIntervalMs: 1000,
    });
  });
  
  afterEach(async () => {
    await pool.shutdown();
  });
  
  describe('acquire', () => {
    it('should create a new connection on first acquire', async () => {
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      const client = await pool.acquire('device-1', {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      });
      
      expect(client).toBeDefined();
      
      const metrics = pool.getMetrics();
      expect(metrics.totalCreated).toBe(1);
      expect(metrics.activeConnections).toBe(1);
    });
    
    it('should reuse idle connection on second acquire', async () => {
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      const config = {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      };
      
      const client1 = await pool.acquire('device-1', config);
      pool.release('device-1', client1);
      
      const client2 = await pool.acquire('device-1', config);
      
      expect(client1).toBe(client2);
      
      const metrics = pool.getMetrics();
      expect(metrics.totalCreated).toBe(1);
      expect(metrics.totalReused).toBe(1);
    });
    
    it('should respect maxConnectionsPerDevice limit', async () => {
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      const config = {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      };
      
      await pool.acquire('device-1', config);
      await pool.acquire('device-1', config);
      
      await expect(
        pool.acquire('device-1', config)
      ).rejects.toThrow('SSH pool exhausted');
    });
  });
  
  describe('release', () => {
    it('should mark connection as idle', async () => {
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      const client = await pool.acquire('device-1', {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      });
      
      pool.release('device-1', client);
      
      const metrics = pool.getMetrics();
      const devicePool = metrics.connectionsPerDevice.find(d => d.deviceId === 'device-1');
      
      expect(devicePool?.inUse).toBe(0);
      expect(devicePool?.idle).toBe(1);
    });
  });
  
  describe('destroy', () => {
    it('should remove connection from pool', async () => {
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(mockClient, 'end').mockImplementation(() => {});
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      const client = await pool.acquire('device-1', {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      });
      
      await pool.destroy('device-1', client);
      
      const metrics = pool.getMetrics();
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.totalDestroyed).toBe(1);
    });
  });
  
  describe('cleanup', () => {
    it('should clean up idle connections after timeout', async () => {
      vi.useFakeTimers();
      
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(mockClient, 'end').mockImplementation(() => {});
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      const client = await pool.acquire('device-1', {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      });
      
      pool.release('device-1', client);
      
      vi.advanceTimersByTime(6000);
      
      await vi.runAllTimersAsync();
      
      const metrics = pool.getMetrics();
      expect(metrics.activeConnections).toBe(0);
      
      vi.useRealTimers();
    });
  });
  
  describe('getMetrics', () => {
    it('should return accurate metrics', async () => {
      const mockClient = new Client();
      vi.spyOn(mockClient, 'connect').mockImplementation(function(this: Client) {
        setTimeout(() => this.emit('ready'), 10);
        return this;
      });
      vi.spyOn(Client.prototype, 'connect').mockReturnValue(mockClient);
      
      await pool.acquire('device-1', {
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'password',
      });
      
      await pool.acquire('device-2', {
        host: '192.168.1.2',
        port: 22,
        username: 'admin',
        password: 'password',
      });
      
      const metrics = pool.getMetrics();
      
      expect(metrics.poolsCount).toBe(2);
      expect(metrics.activeConnections).toBe(2);
      expect(metrics.connectionsPerDevice).toHaveLength(2);
    });
  });
});
