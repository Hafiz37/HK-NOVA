import { MikroTikAPIClient, MikroTikCommandResult } from './api-client';

export interface PPPoESecretParams {
  username: string;
  password: string;
  service?: string;
  profile?: string;
  comment?: string;
  localAddress?: string;
  remoteAddress?: string;
}

export interface DHCPLeaseParams {
  address: string;
  macAddress: string;
  server?: string;
  comment?: string;
  clientId?: string;
}

export interface QueueParams {
  name: string;
  target: string;
  maxLimit: string;
  burstLimit?: string;
  burstThreshold?: string;
  burstTime?: string;
  priority?: number;
  comment?: string;
}

export class MikroTikCommandBuilder {
  private client: MikroTikAPIClient;

  constructor(client: MikroTikAPIClient) {
    this.client = client;
  }

  async createPPPoESecret(params: PPPoESecretParams): Promise<MikroTikCommandResult> {
    const commandParams: Record<string, string> = {
      name: params.username,
      password: params.password,
      service: params.service || 'pppoe',
    };

    if (params.profile) commandParams.profile = params.profile;
    if (params.comment) commandParams.comment = params.comment;
    if (params.localAddress) commandParams['local-address'] = params.localAddress;
    if (params.remoteAddress) commandParams['remote-address'] = params.remoteAddress;

    return this.client.executeCommand('/ppp/secret/add', commandParams);
  }

  async removePPPoESecret(username: string): Promise<MikroTikCommandResult> {
    try {
      const findResult = await this.client.executeCommand('/ppp/secret/print', {
        '?name': username,
      });

      if (!findResult.success || !findResult.data || findResult.data.length === 0) {
        return {
          success: false,
          error: `PPPoE secret '${username}' not found`,
        };
      }

      const secretId = findResult.data[0]['.id'];
      
      return this.client.executeCommand('/ppp/secret/remove', {
        '.id': secretId,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async suspendPPPoESecret(username: string): Promise<MikroTikCommandResult> {
    try {
      const findResult = await this.client.executeCommand('/ppp/secret/print', {
        '?name': username,
      });

      if (!findResult.success || !findResult.data || findResult.data.length === 0) {
        return {
          success: false,
          error: `PPPoE secret '${username}' not found`,
        };
      }

      const secretId = findResult.data[0]['.id'];
      
      return this.client.executeCommand('/ppp/secret/disable', {
        '.id': secretId,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async reactivatePPPoESecret(username: string): Promise<MikroTikCommandResult> {
    try {
      const findResult = await this.client.executeCommand('/ppp/secret/print', {
        '?name': username,
      });

      if (!findResult.success || !findResult.data || findResult.data.length === 0) {
        return {
          success: false,
          error: `PPPoE secret '${username}' not found`,
        };
      }

      const secretId = findResult.data[0]['.id'];
      
      return this.client.executeCommand('/ppp/secret/enable', {
        '.id': secretId,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getPPPoEStatus(username: string): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/ppp/active/print', {
      '?name': username,
    });
  }

  async listPPPoESecrets(): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/ppp/secret/print');
  }

  async createQueue(params: QueueParams): Promise<MikroTikCommandResult> {
    const commandParams: Record<string, string | number> = {
      name: params.name,
      target: params.target,
      'max-limit': params.maxLimit,
    };

    if (params.burstLimit) commandParams['burst-limit'] = params.burstLimit;
    if (params.burstThreshold) commandParams['burst-threshold'] = params.burstThreshold;
    if (params.burstTime) commandParams['burst-time'] = params.burstTime;
    if (params.priority) commandParams.priority = params.priority;
    if (params.comment) commandParams.comment = params.comment;

    return this.client.executeCommand('/queue/simple/add', commandParams);
  }

  async updateQueue(name: string, maxLimit: string): Promise<MikroTikCommandResult> {
    try {
      const findResult = await this.client.executeCommand('/queue/simple/print', {
        '?name': name,
      });

      if (!findResult.success || !findResult.data || findResult.data.length === 0) {
        return {
          success: false,
          error: `Queue '${name}' not found`,
        };
      }

      const queueId = findResult.data[0]['.id'];
      
      return this.client.executeCommand('/queue/simple/set', {
        '.id': queueId,
        'max-limit': maxLimit,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async removeQueue(name: string): Promise<MikroTikCommandResult> {
    try {
      const findResult = await this.client.executeCommand('/queue/simple/print', {
        '?name': name,
      });

      if (!findResult.success || !findResult.data || findResult.data.length === 0) {
        return {
          success: false,
          error: `Queue '${name}' not found`,
        };
      }

      const queueId = findResult.data[0]['.id'];
      
      return this.client.executeCommand('/queue/simple/remove', {
        '.id': queueId,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listQueues(): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/queue/simple/print');
  }

  async createDHCPLease(params: DHCPLeaseParams): Promise<MikroTikCommandResult> {
    const commandParams: Record<string, string> = {
      address: params.address,
      'mac-address': params.macAddress,
    };

    if (params.server) commandParams.server = params.server;
    if (params.comment) commandParams.comment = params.comment;
    if (params.clientId) commandParams['client-id'] = params.clientId;

    return this.client.executeCommand('/ip/dhcp-server/lease/add', commandParams);
  }

  async removeDHCPLease(address: string): Promise<MikroTikCommandResult> {
    try {
      const findResult = await this.client.executeCommand('/ip/dhcp-server/lease/print', {
        '?address': address,
      });

      if (!findResult.success || !findResult.data || findResult.data.length === 0) {
        return {
          success: false,
          error: `DHCP lease '${address}' not found`,
        };
      }

      const leaseId = findResult.data[0]['.id'];
      
      return this.client.executeCommand('/ip/dhcp-server/lease/remove', {
        '.id': leaseId,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listDHCPLeases(): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/ip/dhcp-server/lease/print');
  }

  async getSystemResource(): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/system/resource/print');
  }

  async getSystemIdentity(): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/system/identity/print');
  }

  async listInterfaces(): Promise<MikroTikCommandResult> {
    return this.client.executeCommand('/interface/print');
  }
}

export function createCommandBuilder(client: MikroTikAPIClient): MikroTikCommandBuilder {
  return new MikroTikCommandBuilder(client);
}
