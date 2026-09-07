import { RouterOSAPI } from 'routeros-client';

export interface MikroTikConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  timeout?: number;
  keepalive?: boolean;
}

export interface MikroTikCommandResult {
  success: boolean;
  data?: any[];
  error?: string;
  command?: string;
}

class MikroTikConnectionPool {
  private connections: Map<string, RouterOSAPI> = new Map();
  private connectionAttempts: Map<string, number> = new Map();
  private readonly maxConnectionsPerDevice = 5;
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectDelay = 2000;

  async getConnection(config: MikroTikConnectionConfig): Promise<RouterOSAPI> {
    const key = `${config.host}:${config.port || 8728}`;
    
    let connection = this.connections.get(key);
    
    if (connection && connection.connected) {
      return connection;
    }

    if (this.connections.size >= this.maxConnectionsPerDevice) {
      throw new Error(`Maximum connections (${this.maxConnectionsPerDevice}) reached for device pool`);
    }

    connection = await this.createConnection(config, key);
    this.connections.set(key, connection);
    
    return connection;
  }

  private async createConnection(config: MikroTikConnectionConfig, key: string): Promise<RouterOSAPI> {
    const attempts = this.connectionAttempts.get(key) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      this.connectionAttempts.delete(key);
      throw new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded for ${key}`);
    }

    try {
      const api = new RouterOSAPI({
        host: config.host,
        user: config.username,
        password: config.password,
        port: config.port || 8728,
        timeout: config.timeout || 30,
        keepalive: config.keepalive ?? true,
      });

      await api.connect();
      
      api.on('error', (error) => {
        console.error(`[MikroTik ${key}] Connection error:`, error);
        this.handleConnectionError(key);
      });

      api.on('close', () => {
        console.log(`[MikroTik ${key}] Connection closed`);
        this.connections.delete(key);
      });

      this.connectionAttempts.set(key, 0);
      console.log(`[MikroTik ${key}] Connected successfully`);
      
      return api;
    } catch (error) {
      this.connectionAttempts.set(key, attempts + 1);
      console.error(`[MikroTik ${key}] Connection failed (attempt ${attempts + 1}/${this.maxReconnectAttempts}):`, error);
      
      if (attempts + 1 < this.maxReconnectAttempts) {
        await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
        return this.createConnection(config, key);
      }
      
      throw error;
    }
  }

  private handleConnectionError(key: string): void {
    const connection = this.connections.get(key);
    if (connection) {
      this.connections.delete(key);
    }
  }

  async disconnect(config: MikroTikConnectionConfig): Promise<void> {
    const key = `${config.host}:${config.port || 8728}`;
    const connection = this.connections.get(key);
    
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error(`[MikroTik ${key}] Error closing connection:`, error);
      }
      this.connections.delete(key);
      this.connectionAttempts.delete(key);
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(key => {
      const [host, port] = key.split(':');
      return this.disconnect({ host, port: parseInt(port), username: '', password: '' });
    });
    
    await Promise.allSettled(disconnectPromises);
  }

  getActiveConnections(): number {
    return this.connections.size;
  }
}

const connectionPool = new MikroTikConnectionPool();

export class MikroTikAPIClient {
  private config: MikroTikConnectionConfig;

  constructor(config: MikroTikConnectionConfig) {
    this.config = {
      ...config,
      port: config.port || 8728,
      timeout: config.timeout || 30,
      keepalive: config.keepalive ?? true,
    };
  }

  async executeCommand(command: string, params?: Record<string, string | number>): Promise<MikroTikCommandResult> {
    let connection: RouterOSAPI | null = null;

    try {
      connection = await connectionPool.getConnection(this.config);

      const commandParts = command.split(' ');
      const baseCommand = commandParts.join('/');

      let result;
      if (params) {
        result = await connection.write(baseCommand, params);
      } else {
        result = await connection.write(baseCommand);
      }

      return {
        success: true,
        data: Array.isArray(result) ? result : [result],
        command: command,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MikroTik] Command execution failed: ${command}`, error);
      
      return {
        success: false,
        error: errorMessage,
        command: command,
      };
    }
  }

  async testConnection(): Promise<MikroTikCommandResult> {
    try {
      const result = await this.executeCommand('/system/identity/print');
      
      if (result.success && result.data && result.data.length > 0) {
        return {
          success: true,
          data: result.data,
          command: 'test_connection',
        };
      }

      return {
        success: false,
        error: 'Unable to retrieve system identity',
        command: 'test_connection',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        command: 'test_connection',
      };
    }
  }

  async disconnect(): Promise<void> {
    await connectionPool.disconnect(this.config);
  }

  static async disconnectAll(): Promise<void> {
    await connectionPool.disconnectAll();
  }

  static getActiveConnections(): number {
    return connectionPool.getActiveConnections();
  }
}

export async function createMikroTikClient(config: MikroTikConnectionConfig): Promise<MikroTikAPIClient> {
  const client = new MikroTikAPIClient(config);
  
  const testResult = await client.testConnection();
  if (!testResult.success) {
    throw new Error(`Failed to connect to MikroTik at ${config.host}: ${testResult.error}`);
  }

  return client;
}

export { connectionPool };
