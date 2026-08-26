declare module 'net-ping' {
  export interface SessionOptions {
    networkProtocol?: number;
    packetSize?: number;
    retries?: number;
    sessionId?: number;
    timeout?: number;
    ttl?: number;
  }

  export interface Session {
    pingHost(
      target: string,
      callback: (error: Error | null, target: string, sent: Date, rcvd: Date) => void
    ): void;
    close(): void;
  }

  export enum NetworkProtocol {
    IPv4 = 1,
    IPv6 = 2,
  }

  export function createSession(options?: SessionOptions): Session;
}
