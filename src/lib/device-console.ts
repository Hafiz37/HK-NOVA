import { Client } from 'ssh2';
import { DEFAULT_SSH_TIMEOUT } from './constants';
import { safeDecrypt } from './encryption';
import { sshPool } from './ssh-pool';
import { sshRetry } from './retry';
import { sshCircuitBreaker } from './circuit-breaker';
import { deviceQueue } from './device-operation-queue';

export interface ConsoleCredentials {
  sshUsername: string | null;
  sshPassword: string | null;
  sshPort: number | null;
}

export interface ExecConsoleOptions {
  host: string;
  username: string;
  password: string;
  port?: number;
  timeoutMs?: number;
  command: string;
  deviceId?: string;
}

export interface InteractiveConsoleOptions {
  host: string;
  username: string;
  password: string;
  port?: number;
  timeoutMs?: number;
  commands: string[];
  deviceId?: string;
  /** Delay between commands (ms). */
  lineDelayMs?: number;
  /** Quiet period (no output) before the session is considered done. */
  quietMs?: number;
}

export interface ConsoleResult {
  ok: boolean;
  stdout: string;
  stderr?: string;
  error?: string;
}

/**
 * Decrypt stored SSH credentials. Returns null when SSH is not configured.
 */
export function resolveSshCredentials(
  creds: ConsoleCredentials | null | undefined
): { username: string; password: string; port: number } | null {
  if (!creds?.sshUsername) return null;
  const password = safeDecrypt(creds.sshPassword);
  if (!password) return null;
  return { username: creds.sshUsername, password, port: creds.sshPort ?? 22 };
}

function connectOnce(opts: Pick<ExecConsoleOptions, 'host' | 'username' | 'password' | 'port' | 'timeoutMs'>) {
  const conn = new Client();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SSH_TIMEOUT;
  return new Promise<Client>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* ignore */ }
      reject(new Error('SSH connection timeout'));
    }, timeoutMs + 3000);

    conn.once('ready', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(conn);
    });
    conn.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    conn.connect({
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.username,
      password: opts.password,
      readyTimeout: timeoutMs,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
    });
  });
}

/**
 * Execute a single CLI command over SSH and return its stdout.
 */
export async function execSshCommand(opts: ExecConsoleOptions): Promise<ConsoleResult> {
  const deviceId = opts.deviceId || `${opts.host}:${opts.port || 22}`;
  
  return deviceQueue.enqueue(deviceId, 'ssh', async () => {
    const breaker = sshCircuitBreaker(deviceId);
    
    try {
      const result = await breaker.execute(async () => {
        return await sshRetry.execute(async () => {
          let client: Client | null = null;
          
          try {
            client = await sshPool.acquire(deviceId, {
              host: opts.host,
              port: opts.port ?? 22,
              username: opts.username,
              password: opts.password,
              readyTimeout: opts.timeoutMs ?? DEFAULT_SSH_TIMEOUT,
              keepaliveInterval: 10_000,
              keepaliveCountMax: 3,
            });
            
            const commandResult = await executeCommandOnClient(client, opts.command, opts.timeoutMs);
            
            sshPool.release(deviceId, client);
            
            return commandResult;
            
          } catch (err) {
            if (client) {
              await sshPool.destroy(deviceId, client);
            }
            throw err;
          }
        });
      });
      
      return result;
    } catch (err) {
      return {
        ok: false,
        stdout: '',
        error: err instanceof Error ? err.message : 'SSH operation failed',
      };
    }
  });
}

async function executeCommandOnClient(
  client: Client,
  command: string,
  timeoutMs?: number
): Promise<ConsoleResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, stdout: '', error: 'SSH command timeout' });
    }, timeoutMs ?? DEFAULT_SSH_TIMEOUT);
    
    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        resolve({ ok: false, stdout: '', error: err.message });
        return;
      }
      
      let stdout = '';
      let stderr = '';
      
      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      stream.on('close', (code: number) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: code !== 0 ? `Command exited with code ${code}` : undefined,
        });
      });
    });
  });
}

/**
 * Run multiple CLI commands in an interactive shell session (for provisioning
 * workflows where command context matters: interface mode, etc.).
 */
export async function runSshCommands(opts: InteractiveConsoleOptions): Promise<ConsoleResult> {
  const deviceId = opts.deviceId || `${opts.host}:${opts.port || 22}`;
  
  return deviceQueue.enqueue(deviceId, 'ssh', async () => {
    const breaker = sshCircuitBreaker(deviceId);
    
    try {
      const result = await breaker.execute(async () => {
        return await sshRetry.execute(async () => {
          let client: Client | null = null;
          
          try {
            client = await sshPool.acquire(deviceId, {
              host: opts.host,
              port: opts.port ?? 22,
              username: opts.username,
              password: opts.password,
              readyTimeout: opts.timeoutMs ?? DEFAULT_SSH_TIMEOUT,
              keepaliveInterval: 10_000,
              keepaliveCountMax: 3,
            });
            
            const sessionResult = await runInteractiveSession(client, opts);
            
            sshPool.release(deviceId, client);
            
            return sessionResult;
            
          } catch (err) {
            if (client) {
              await sshPool.destroy(deviceId, client);
            }
            throw err;
          }
        });
      });
      
      return result;
    } catch (err) {
      return {
        ok: false,
        stdout: '',
        error: err instanceof Error ? err.message : 'SSH operation failed',
      };
    }
  });
}

async function runInteractiveSession(
  client: Client,
  opts: InteractiveConsoleOptions
): Promise<ConsoleResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SSH_TIMEOUT;
  const lineDelayMs = opts.lineDelayMs ?? 150;
  const quietMs = opts.quietMs ?? 600;

  return new Promise<ConsoleResult>((resolve) => {
    let settled = false;
    const finish = (result: ConsoleResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (poller !== null) clearInterval(poller);
      poller = null;
      resolve(result);
    };

    const hardTimer = setTimeout(() => {
      finish({ ok: false, stdout: buffer, error: 'SSH session timeout' });
    }, timeoutMs + 30_000);

    let buffer = '';
    let commandIndex = 0;
    let lastDataAt = Date.now();
    let poller: ReturnType<typeof setInterval> | null = null;

    client.shell((shellErr, stream) => {
      if (shellErr) {
        finish({ ok: false, stdout: buffer, error: shellErr.message });
        return;
      }

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        lastDataAt = Date.now();
      });
      stream.on('error', (streamErr: Error) => {
        finish({ ok: false, stdout: buffer, error: streamErr.message });
      });
      stream.on('close', () => {
        finish({ ok: true, stdout: buffer });
      });

      const sendNext = () => {
        if (settled) return;
        if (commandIndex < opts.commands.length) {
          const cmd = opts.commands[commandIndex++];
          stream.write(cmd.endsWith('\r') ? cmd : cmd + '\r');
          setTimeout(sendNext, lineDelayMs);
        }
      };

      setTimeout(sendNext, 300);

      poller = setInterval(() => {
        if (settled) return;
        if (commandIndex >= opts.commands.length && Date.now() - lastDataAt > quietMs) {
          finish({ ok: true, stdout: buffer });
        }
      }, 150);
    });
  });
}