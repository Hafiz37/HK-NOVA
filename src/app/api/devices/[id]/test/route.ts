import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encryption';
import { DEFAULT_PING_TIMEOUT, DEFAULT_SNMP_TIMEOUT, DEFAULT_SSH_TIMEOUT } from '@/lib/constants';
import { requireSession } from '@/lib/auth';

interface Params {
  params: Promise<{ id: string }>;
}

type TestType = 'icmp' | 'snmp' | 'ssh';

async function testIcmp(ip: string): Promise<{ ok: boolean; latencyMs: number | null; message: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ping = require('net-ping') as {
    createSession: (opts: { timeout: number; retries: number }) => {
      pingHost: (
        host: string,
        cb: (err: Error | null, target: string, sent: Date, rcvd: Date) => void
      ) => void;
      close: () => void;
    };
  };

  return new Promise((resolve) => {
    let session: ReturnType<typeof ping.createSession>;
    try {
      session = ping.createSession({ timeout: DEFAULT_PING_TIMEOUT, retries: 1 });
    } catch (err) {
      // Raw ICMP memerlukan CAP_NET_RAW / root; fallback tidak gagalkan endpoint
      const msg = err instanceof Error ? err.message : 'Gagal membuat ICMP session';
      resolve({ ok: false, latencyMs: null, message: msg });
      return;
    }
    const sentAt = Date.now();
    session.pingHost(ip, (err, _target, _sent, rcvd) => {
      try {
        session.close();
      } catch {
        /* ignore */
      }
      if (err) {
        resolve({ ok: false, latencyMs: null, message: err.message || 'ICMP ping gagal' });
        return;
      }
      const latencyMs = rcvd ? rcvd.getTime() - sentAt : Date.now() - sentAt;
      resolve({ ok: true, latencyMs, message: `Reachable, latency ${latencyMs.toFixed(1)} ms` });
    });
  });
}

async function testSnmp(
  ip: string,
  communityEncrypted: string | null,
  port?: number | null
): Promise<{ ok: boolean; message: string; sysName?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const snmp = require('net-snmp') as {
    createSession: (
      target: string,
      community: string,
      options: { port?: number; timeout: number; retries: number; version: number }
    ) => {
      get: (
        oids: string[],
        cb: (error: Error | null, varbinds: Array<{ oid: string; type: number; value: unknown }>) => void
      ) => void;
      close: () => void;
    };
    Version2c: number;
    isVarbindError: (vb: { type: number }) => boolean;
  };

  const community = safeDecrypt(communityEncrypted) || 'public';

  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      port: port ?? 161,
      timeout: DEFAULT_SNMP_TIMEOUT,
      retries: 1,
      version: snmp.Version2c,
    });

    session.get(['1.3.6.1.2.1.1.5.0'], (error, varbinds) => {
      try {
        session.close();
      } catch {
        /* ignore */
      }
      if (error) {
        resolve({ ok: false, message: error.message || 'SNMP get gagal' });
        return;
      }
      const vb = varbinds?.[0];
      if (!vb || snmp.isVarbindError(vb)) {
        resolve({ ok: false, message: 'SNMP response invalid atau community salah' });
        return;
      }
      const sysName = String(vb.value ?? '');
      resolve({ ok: true, message: `SNMP OK${sysName ? ` — sysName: ${sysName}` : ''}`, sysName });
    });
  });
}

async function testSsh(
  ip: string,
  username: string | null,
  passwordEncrypted: string | null,
  port: number | null
): Promise<{ ok: boolean; message: string }> {
  if (!username) {
    return { ok: false, message: 'SSH username belum dikonfigurasi' };
  }
  const password = safeDecrypt(passwordEncrypted);
  if (!password) {
    return { ok: false, message: 'SSH password belum dikonfigurasi' };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const { Client } = require('ssh2') as { Client: new () => any };

  return new Promise((resolve) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      try {
        conn.end();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, message: `SSH timeout setelah ${DEFAULT_SSH_TIMEOUT} ms` });
    }, DEFAULT_SSH_TIMEOUT);

    conn
      .on('ready', () => {
        clearTimeout(timer);
        try {
          conn.end();
        } catch {
          /* ignore */
        }
        resolve({ ok: true, message: `SSH OK ke ${ip}:${port ?? 22} sebagai ${username}` });
      })
      .on('error', (err: unknown) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : 'SSH connection failed';
        resolve({ ok: false, message: msg });
      })
      .connect({
        host: ip,
        port: port ?? 22,
        username,
        password,
        readyTimeout: DEFAULT_SSH_TIMEOUT,
      });
  });
}

/**
 * POST /api/devices/[id]/test
 * Body: { type: "icmp" | "snmp" | "ssh" }
 */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const type = (body?.type as TestType) || 'icmp';

    if (!['icmp', 'snmp', 'ssh'].includes(type)) {
      return NextResponse.json({ error: 'type harus icmp, snmp, atau ssh' }, { status: 400 });
    }

    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      include: { credentials: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const started = Date.now();
    let result: { ok: boolean; message: string; latencyMs?: number | null; sysName?: string };

    if (type === 'icmp') {
      const r = await testIcmp(device.ip);
      result = { ok: r.ok, message: r.message, latencyMs: r.latencyMs };
    } else if (type === 'snmp') {
      const r = await testSnmp(
        device.ip,
        device.credentials?.snmpCommunity ?? null,
        device.credentials?.snmpPort ?? 161
      );
      result = { ok: r.ok, message: r.message, sysName: r.sysName };
    } else {
      const r = await testSsh(
        device.ip,
        device.credentials?.sshUsername ?? null,
        device.credentials?.sshPassword ?? null,
        device.credentials?.sshPort ?? 22
      );
      result = { ok: r.ok, message: r.message };
    }

    return NextResponse.json({
      data: {
        deviceId: device.id,
        deviceName: device.name,
        ip: device.ip,
        type,
        success: result.ok,
        message: result.message,
        latencyMs: result.latencyMs ?? null,
        sysName: result.sysName ?? null,
        durationMs: Date.now() - started,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/test] Error:', error);
    return NextResponse.json({ error: 'Gagal menjalankan connection test' }, { status: 500 });
  }
}
