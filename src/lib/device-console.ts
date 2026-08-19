import { Client } from 'ssh2';
import { DEFAULT_SSH_TIMEOUT } from './constants';
import { safeDecrypt } from './encryption';

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
}

export interface InteractiveConsoleOptions {
  host: string;
  username: string;
  password: string;
  port?: number;
  timeoutMs?: number;
  commands: string[];
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
  let conn: Client | null = null;
  try {
    conn = await connectOnce(opts);
  } catch (err) {
    return { ok: false, stdout: '', error: err instanceof Error ? err.message : 'SSH connection failed' };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_SSH_TIMEOUT;

  return new Promise<ConsoleResult>((resolve) => {
    let settled = false;
    const finish = (result: ConsoleResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn?.end(); } catch { /* ignore */ }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, stdout: '', error: 'SSH command timeout' });
    }, timeoutMs + 8000);

    conn!.exec(opts.command, (err, stream) => {
      if (err) {
        finish({ ok: false, stdout: '', error: err.message });
        return;
      }

      let stdout = '';
      let stderr = '';
      stream.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      stream.on('close', () => {
        finish({ ok: true, stdout, stderr });
      });
      stream.on('error', (streamErr: Error) => {
        finish({ ok: false, stdout, stderr, error: streamErr.message });
      });
    });
  });
}

/**
 * Run multiple CLI commands in an interactive shell session (for provisioning
 * workflows where command context matters: interface mode, etc.).
 */
export async function runSshCommands(opts: InteractiveConsoleOptions): Promise<ConsoleResult> {
  let conn: Client | null = null;
  try {
    conn = await connectOnce(opts);
  } catch (err) {
    return { ok: false, stdout: '', error: err instanceof Error ? err.message : 'SSH connection failed' };
  }

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
      try { conn?.end(); } catch { /* ignore */ }
      resolve(result);
    };

    const hardTimer = setTimeout(() => {
      finish({ ok: false, stdout: buffer, error: 'SSH session timeout' });
    }, timeoutMs + 30_000);

    let buffer = '';
    let commandIndex = 0;
    let lastDataAt = Date.now();
    let poller: ReturnType<typeof setInterval> | null = null;

    conn!.shell((shellErr, stream) => {
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

      // Give the shell a moment to show its prompt before typing.
      setTimeout(sendNext, 300);

      poller = setInterval(() => {
        if (settled) return;
        // All commands sent + quiet period observed → session done.
        if (commandIndex >= opts.commands.length && Date.now() - lastDataAt > quietMs) {
          finish({ ok: true, stdout: buffer });
        }
      }, 150);
    });
  });
}