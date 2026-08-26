declare module 'net-snmp' {
  export interface Varbind {
    oid: string;
    type: number;
    value: number | string | Buffer;
  }

  export interface SessionOptions {
    port?: number;
    version?: number;
    backoff?: number;
    transport?: string;
    trapPort?: number;
    retries?: number;
    timeout?: number;
    idName?: string;
  }

  export interface Session {
    get(oids: string[], callback: (error: Error | null, varbinds: Varbind[]) => void): void;
    getNext(oids: string[], callback: (error: Error | null, varbinds: Varbind[]) => void): void;
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCallback: (varbinds: Varbind[]) => void,
      doneCallback: (error: Error | null) => void
    ): void;
    close(): void;
  }

  export enum ObjectType {
    Boolean = 1,
    Integer = 2,
    OctetString = 4,
    Null = 5,
    OID = 6,
    IpAddress = 64,
    Counter = 65,
    Gauge = 66,
    TimeTicks = 67,
    Opaque = 68,
    Counter64 = 70,
    NoSuchObject = 128,
    NoSuchInstance = 129,
    EndOfMibView = 130,
  }

  export enum Version {
    Version1 = 0,
    Version2c = 1,
    Version3 = 3,
  }

  export function createSession(target: string, community: string, options?: SessionOptions): Session;
  export function isVarbindError(varbind: Varbind): boolean;
  export function varbindError(varbind: Varbind): string;
}
