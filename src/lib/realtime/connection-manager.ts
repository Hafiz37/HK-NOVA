import { Readable } from 'stream';
import { RealtimeEvent, RealtimeChannel, RealtimeEventType, SubscriptionOptions } from './events';

interface ClientConnection {
  id: string;
  userId: string;
  userRole: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  subscriptions: Set<RealtimeChannel>;
  filters: SubscriptionOptions['filters'];
  includeDetails: boolean;
  connectedAt: Date;
  lastPing: Date;
}

class ConnectionManager {
  private connections: Map<string, ClientConnection> = new Map();
  private channelSubscriptions: Map<RealtimeChannel, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
    this.startCleanup();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const [clientId, client] of this.connections) {
        if (now.getTime() - client.lastPing.getTime() > 60000) {
          this.removeConnection(clientId);
        }
      }
    }, 30000);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      for (const [channel, clients] of this.channelSubscriptions) {
        for (const clientId of clients) {
          if (!this.connections.has(clientId)) {
            clients.delete(clientId);
          }
        }
      }
    }, 60000);
  }

  addConnection(
    clientId: string,
    userId: string,
    userRole: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): void {
    const connection: ClientConnection = {
      id: clientId,
      userId,
      userRole,
      controller,
      subscriptions: new Set(),
      filters: {},
      includeDetails: true,
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    this.connections.set(clientId, connection);
    this.sendEvent(clientId, { type: 'connected', timestamp: new Date().toISOString(), data: { clientId } });
  }

  removeConnection(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (connection) {
      for (const channel of connection.subscriptions) {
        const clients = this.channelSubscriptions.get(channel);
        if (clients) {
          clients.delete(clientId);
        }
      }
      this.connections.delete(clientId);
    }
  }

  subscribe(clientId: string, options: SubscriptionOptions): boolean {
    const connection = this.connections.get(clientId);
    if (!connection) return false;

    connection.subscriptions = new Set(options.channels);
    connection.filters = options.filters || {};
    connection.includeDetails = options.includeDetails ?? true;

    for (const channel of options.channels) {
      if (!this.channelSubscriptions.has(channel)) {
        this.channelSubscriptions.set(channel, new Set());
      }
      this.channelSubscriptions.get(channel)!.add(clientId);
    }

    return true;
  }

  unsubscribe(clientId: string, channels: RealtimeChannel[]): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    for (const channel of channels) {
      connection.subscriptions.delete(channel);
      const clients = this.channelSubscriptions.get(channel);
      if (clients) {
        clients.delete(clientId);
      }
    }
  }

  updateFilters(clientId: string, filters: SubscriptionOptions['filters']): boolean {
    const connection = this.connections.get(clientId);
    if (!connection) return false;

    connection.filters = filters || {};
    return true;
  }

  ping(clientId: string): boolean {
    const connection = this.connections.get(clientId);
    if (!connection) return false;

    connection.lastPing = new Date();
    return true;
  }

  broadcast(event: RealtimeEvent): number {
    let sent = 0;
    const channels = this.getChannelsForEvent(event.type);

    for (const channel of channels) {
      const clients = this.channelSubscriptions.get(channel);
      if (!clients) continue;

      for (const clientId of clients) {
        const connection = this.connections.get(clientId);
        if (!connection) continue;

        if (this.shouldSendToClient(connection, event)) {
          this.sendEvent(clientId, event);
          sent++;
        }
      }
    }

    return sent;
  }

  private getChannelsForEvent(eventType: RealtimeEventType): RealtimeChannel[] {
    const mapping: Record<RealtimeEventType, RealtimeChannel[]> = {
      'device.created': ['devices'],
      'device.updated': ['devices'],
      'device.deleted': ['devices'],
      'device.status_changed': ['devices', 'devices:metrics'],
      'device.metrics_updated': ['devices:metrics', 'dashboard'],
      'device.alerts_updated': ['devices:alerts', 'alerts'],
      'alert.created': ['alerts', 'devices:alerts', 'dashboard'],
      'alert.acknowledged': ['alerts', 'devices:alerts'],
      'alert.resolved': ['alerts', 'devices:alerts'],
      'alert.escalated': ['alerts'],
      'provisioning.started': ['provisioning'],
      'provisioning.progress': ['provisioning'],
      'provisioning.completed': ['provisioning'],
      'provisioning.failed': ['provisioning'],
      'provisioning.rolled_back': ['provisioning'],
      'anomaly.detected': ['anomalies', 'dashboard'],
      'anomaly.feedback': ['anomalies'],
      'anomaly.deleted': ['anomalies'],
      'backup.started': ['backups'],
      'backup.completed': ['backups'],
      'backup.failed': ['backups'],
      'maintenance.started': ['maintenance'],
      'maintenance.ended': ['maintenance'],
'dashboard.stats_updated': ['dashboard', 'dashboard:stats'],
      'connected': [],

    };
    return mapping[eventType] || [];
  }

  private shouldSendToClient(connection: ClientConnection, event: RealtimeEvent): boolean {
    const { filters } = connection;

    if (filters?.deviceIds && event.entityId && !filters.deviceIds.includes(event.entityId)) {
      return false;
    }

    if (event.type.startsWith('alert.') && filters?.alertSeverities) {
      const severity = (event.data as any)?.severity;
      if (severity && !filters.alertSeverities.includes(severity)) {
        return false;
      }
    }

    if (event.type.startsWith('anomaly.') && filters?.anomalySeverities) {
      const severity = (event.data as any)?.severity;
      if (severity && !filters.anomalySeverities.includes(severity)) {
        return false;
      }
    }

    if (event.type.startsWith('provisioning.') && filters?.provisioningActions) {
      const action = (event.data as any)?.action;
      if (action && !filters.provisioningActions.includes(action)) {
        return false;
      }
    }

    return true;
  }

  private sendEvent(clientId: string, event: RealtimeEvent): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      connection.controller.enqueue(new TextEncoder().encode(data));
    } catch (error) {
      console.error(`Failed to send event to client ${clientId}:`, error);
      this.removeConnection(clientId);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getChannelStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [channel, clients] of this.channelSubscriptions) {
      stats[channel] = clients.size;
    }
    return stats;
  }

  getConnectionInfo(): Array<{
    id: string;
    userId: string;
    userRole: string;
    subscriptions: string[];
    connectedAt: string;
    lastPing: string;
  }> {
    return Array.from(this.connections.values()).map(c => ({
      id: c.id,
      userId: c.userId,
      userRole: c.userRole,
      subscriptions: Array.from(c.subscriptions),
      connectedAt: c.connectedAt.toISOString(),
      lastPing: c.lastPing.toISOString(),
    }));
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [clientId, connection] of this.connections) {
      try {
        connection.controller.close();
      } catch {
        // Ignore
      }
    }
    this.connections.clear();
    this.channelSubscriptions.clear();
  }
}

export const connectionManager = new ConnectionManager();