# 🚨 CRITICAL FIXES - PRIORITY ORDER
## HK-NOVA Production Readiness - Action Plan

**Date:** 2026-09-05  
**Priority:** URGENT - DO NOT DEPLOY WITHOUT THESE FIXES

---

## 🔥 IMMEDIATE ACTIONS (Before ANY Production Deployment)

### 1. CREDENTIAL SECURITY (Priority: P0 - CRITICAL)
**Time Estimate:** 2-3 days  
**Risk if Skipped:** Immediate security breach

**Actions:**
```bash
# Step 1: Remove credentials from .env.production
cd /home/gopal-ichiro/Documents/magang/hk-nova
git checkout .env.production  # Reset to template

# Step 2: Generate new strong credentials
NEW_ADMIN_PASS=$(openssl rand -base64 32)
echo "New Admin Password: $NEW_ADMIN_PASS" | gpg --encrypt --recipient admin@yourdomain.com > admin_pass.gpg

# Step 3: Update .env with placeholders only
sed -i 's/OPERATOR_PASSWORD=.*/OPERATOR_PASSWORD="CHANGE_ME_IN_PRODUCTION"/' .env.production

# Step 4: Add to .gitignore if not already
echo ".env" >> .gitignore
echo ".env.production.local" >> .gitignore

# Step 5: Store keys in secure vault
# Use AWS Secrets Manager, HashiCorp Vault, or 1Password
```

**Code Changes Required:**
```typescript
// src/config/env.ts - Add validation
OPERATOR_PASSWORD: z.string()
  .min(16, 'Password must be at least 16 characters')
  .regex(/[A-Z]/, 'Password must contain uppercase')
  .regex(/[a-z]/, 'Password must contain lowercase')
  .regex(/[0-9]/, 'Password must contain numbers')
  .regex(/[^A-Za-z0-9]/, 'Password must contain special characters')
  .refine(
    (val) => !['password', 'admin', '123456', 'changeme'].some(weak => val.toLowerCase().includes(weak)),
    'Password cannot contain common weak patterns'
  ),
```

**Files to Modify:**
- `.env.production` - Remove all real credentials
- `src/config/env.ts` - Add password strength validation
- `PRODUCTION_KEYS.md` - Delete this file (contains exposed keys)
- `.gitignore` - Ensure all env files are ignored

---

### 2. DEVICE RATE LIMITING (Priority: P0 - CRITICAL)
**Time Estimate:** 3-5 days  
**Risk if Skipped:** Mikrotik router overload, ISP customer impact

**Implementation:**

```typescript
// src/lib/device-rate-limiter.ts (NEW FILE)
import { PrismaClient } from '@prisma/client';

interface DeviceRateLimiter {
  canExecute(deviceId: string, operationType: 'ssh' | 'snmp' | 'backup'): Promise<boolean>;
  recordExecution(deviceId: string, operationType: string): Promise<void>;
  getDeviceLoad(deviceId: string): Promise<number>;
}

// Per-device operation tracking
const deviceOpsInProgress = new Map<string, Set<string>>();
const deviceLastOperation = new Map<string, number>();

const QUIET_PERIOD_MS = 2000; // 2 seconds between operations on same device
const MAX_CONCURRENT_OPS_PER_DEVICE = 2;

export async function canExecuteOnDevice(
  deviceId: string,
  operationType: string
): Promise<{ allowed: boolean; reason?: string }> {
  
  // Check concurrent operations limit
  const opsSet = deviceOpsInProgress.get(deviceId) || new Set();
  if (opsSet.size >= MAX_CONCURRENT_OPS_PER_DEVICE) {
    return { 
      allowed: false, 
      reason: `Device has ${opsSet.size} operations in progress (max: ${MAX_CONCURRENT_OPS_PER_DEVICE})` 
    };
  }

  // Check quiet period
  const lastOp = deviceLastOperation.get(deviceId);
  if (lastOp && Date.now() - lastOp < QUIET_PERIOD_MS) {
    return { 
      allowed: false, 
      reason: `Quiet period active (${QUIET_PERIOD_MS}ms between operations)` 
    };
  }

  return { allowed: true };
}

export async function recordDeviceOperation(
  deviceId: string,
  operationType: string,
  operationId: string
): Promise<void> {
  const opsSet = deviceOpsInProgress.get(deviceId) || new Set();
  opsSet.add(operationId);
  deviceOpsInProgress.set(deviceId, opsSet);
  deviceLastOperation.set(deviceId, Date.now());
}

export async function releaseDeviceOperation(
  deviceId: string,
  operationId: string
): Promise<void> {
  const opsSet = deviceOpsInProgress.get(deviceId);
  if (opsSet) {
    opsSet.delete(operationId);
    if (opsSet.size === 0) {
      deviceOpsInProgress.delete(deviceId);
    }
  }
}
```

**Integration Points:**
```typescript
// src/lib/device-console.ts - Wrap SSH operations
export async function execSshCommand(opts: ExecConsoleOptions): Promise<ConsoleResult> {
  const deviceId = opts.deviceId; // Add deviceId to opts
  const operationId = randomUUID();
  
  // Check rate limit
  const canExecute = await canExecuteOnDevice(deviceId, 'ssh');
  if (!canExecute.allowed) {
    return { ok: false, stdout: '', error: canExecute.reason };
  }
  
  try {
    await recordDeviceOperation(deviceId, 'ssh', operationId);
    // ... existing SSH logic ...
  } finally {
    await releaseDeviceOperation(deviceId, operationId);
  }
}

// src/workers/backup-worker.ts - Add device rate limiting
for (const device of batchFiltered) {
  const canBackup = await canExecuteOnDevice(device.id, 'backup');
  if (!canBackup.allowed) {
    log('WARN', `Skipping ${device.name}: ${canBackup.reason}`);
    skipped++;
    continue;
  }
  // ... perform backup ...
}
```

**Files to Create:**
- `src/lib/device-rate-limiter.ts` (new)

**Files to Modify:**
- `src/lib/device-console.ts` - Add rate limit checks
- `src/workers/backup-worker.ts` - Integrate rate limiter
- `src/workers/snmp-poller.ts` - Integrate rate limiter
- `src/lib/provisioning.ts` - Integrate rate limiter

---

### 3. SSH CONNECTION POOLING (Priority: P0 - CRITICAL)
**Time Estimate:** 4-6 days  
**Risk if Skipped:** Connection exhaustion, system crashes

**Implementation:**

```typescript
// src/lib/ssh-pool.ts (NEW FILE)
import { Client } from 'ssh2';

interface PooledConnection {
  client: Client;
  deviceId: string;
  lastUsed: number;
  inUse: boolean;
}

class SSHConnectionPool {
  private pool: Map<string, PooledConnection[]> = new Map();
  private maxConnectionsPerDevice = 2;
  private maxIdleTimeMs = 60000; // 1 minute
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup idle connections every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), 30000);
  }

  async acquire(deviceId: string, opts: { host: string; username: string; password: string; port: number }): Promise<Client> {
    const devicePool = this.pool.get(deviceId) || [];
    
    // Try to reuse existing idle connection
    const idleConn = devicePool.find(conn => !conn.inUse);
    if (idleConn) {
      idleConn.inUse = true;
      idleConn.lastUsed = Date.now();
      return idleConn.client;
    }

    // Check if we can create new connection
    if (devicePool.length >= this.maxConnectionsPerDevice) {
      throw new Error(`Connection pool exhausted for device ${deviceId} (max: ${this.maxConnectionsPerDevice})`);
    }

    // Create new connection
    const client = await this.createConnection(opts);
    const pooled: PooledConnection = {
      client,
      deviceId,
      lastUsed: Date.now(),
      inUse: true,
    };

    devicePool.push(pooled);
    this.pool.set(deviceId, devicePool);
    
    return client;
  }

  release(deviceId: string, client: Client): void {
    const devicePool = this.pool.get(deviceId);
    if (!devicePool) return;

    const conn = devicePool.find(c => c.client === client);
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
    }
  }

  private async createConnection(opts: { host: string; username: string; password: string; port: number }): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH connection timeout'));
      }, 15000);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve(client);
      });

      client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      client.connect(opts);
    });
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    
    for (const [deviceId, devicePool] of this.pool.entries()) {
      const toRemove: number[] = [];
      
      devicePool.forEach((conn, index) => {
        if (!conn.inUse && now - conn.lastUsed > this.maxIdleTimeMs) {
          conn.client.end();
          toRemove.push(index);
        }
      });

      // Remove from pool
      for (let i = toRemove.length - 1; i >= 0; i--) {
        devicePool.splice(toRemove[i], 1);
      }

      if (devicePool.length === 0) {
        this.pool.delete(deviceId);
      }
    }
  }

  async destroy(): Promise<void> {
    clearInterval(this.cleanupInterval);
    
    for (const devicePool of this.pool.values()) {
      for (const conn of devicePool) {
        conn.client.end();
      }
    }
    
    this.pool.clear();
  }
}

export const sshPool = new SSHConnectionPool();
```

**Integration:**
```typescript
// src/lib/device-console.ts - Use connection pool
export async function execSshCommand(opts: ExecConsoleOptions): Promise<ConsoleResult> {
  let client: Client | null = null;
  
  try {
    client = await sshPool.acquire(opts.deviceId, {
      host: opts.host,
      username: opts.username,
      password: opts.password,
      port: opts.port ?? 22,
    });

    // Execute command using pooled connection
    return await executeCommand(client, opts.command, opts.timeoutMs);
    
  } finally {
    if (client) {
      sshPool.release(opts.deviceId, client);
    }
  }
}
```

**Files to Create:**
- `src/lib/ssh-pool.ts` (new)

**Files to Modify:**
- `src/lib/device-console.ts` - Integrate connection pool
- `src/lib/backup.ts` - Use pooled connections
- `src/lib/provisioning.ts` - Use pooled connections

---

### 4. CIRCUIT BREAKER & RETRY LOGIC (Priority: P0 - CRITICAL)
**Time Estimate:** 3-4 days  
**Risk if Skipped:** Cascading failures, resource waste

**Implementation:**

```typescript
// src/lib/circuit-breaker.ts (NEW FILE)
interface CircuitBreakerConfig {
  failureThreshold: number;    // Open circuit after N failures
  successThreshold: number;    // Close circuit after N successes
  timeout: number;             // Half-open retry timeout (ms)
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
        console.log('[CircuitBreaker] State: HALF_OPEN -> CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.config.timeout;
      console.log(`[CircuitBreaker] State: -> OPEN (retry at ${new Date(this.nextAttempt).toISOString()})`);
    }
  }

  getState(): { state: CircuitState; failures: number; nextAttempt: number | null } {
    return {
      state: this.state,
      failures: this.failures,
      nextAttempt: this.state === 'OPEN' ? this.nextAttempt : null,
    };
  }
}

// Device-specific circuit breakers
const deviceBreakers = new Map<string, CircuitBreaker>();

export function getDeviceCircuitBreaker(deviceId: string): CircuitBreaker {
  let breaker = deviceBreakers.get(deviceId);
  if (!breaker) {
    breaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
    });
    deviceBreakers.set(deviceId, breaker);
  }
  return breaker;
}
```

**Exponential Backoff:**
```typescript
// src/lib/retry.ts (NEW FILE)
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === config.maxAttempts) break;

      // Exponential backoff with jitter
      const exponentialDelay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt - 1),
        config.maxDelayMs
      );
      const jitter = Math.random() * config.jitterMs;
      const delay = exponentialDelay + jitter;

      console.log(`[Retry] Attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay.toFixed(0)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

**Integration:**
```typescript
// src/workers/icmp-poller.ts - Use circuit breaker
async function pollDevice(device: DeviceRecord): Promise<PingResult> {
  const breaker = getDeviceCircuitBreaker(device.id);
  
  try {
    return await breaker.execute(async () => {
      return await retryWithBackoff(
        () => pingDeviceOnce(device),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 5000,
          jitterMs: 500,
        }
      );
    });
  } catch (error) {
    const state = breaker.getState();
    if (state.state === 'OPEN') {
      log('WARN', `Device ${device.name} circuit OPEN (${state.failures} failures)`);
    }
    throw error;
  }
}
```

**Files to Create:**
- `src/lib/circuit-breaker.ts` (new)
- `src/lib/retry.ts` (new)

**Files to Modify:**
- `src/workers/icmp-poller.ts` - Integrate circuit breaker
- `src/workers/snmp-poller.ts` - Integrate circuit breaker
- `src/workers/backup-worker.ts` - Integrate circuit breaker
- `src/lib/device-console.ts` - Add retry logic

---

### 5. DATABASE CONNECTION POOLING (Priority: P0 - CRITICAL)
**Time Estimate:** 1-2 days  
**Risk if Skipped:** Connection exhaustion, database crashes

**Implementation:**

```typescript
// src/lib/prisma.ts - Add connection pool configuration
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // CONNECTION POOL CONFIGURATION
    // Prisma uses connection string parameters for pooling
  });

// Update DATABASE_URL in .env to include pool parameters:
// DATABASE_URL="mysql://user:pass@localhost:3306/db?connection_limit=20&pool_timeout=20&connect_timeout=10"

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

**Environment Configuration:**
```bash
# .env.production - Update DATABASE_URL with pool parameters
DATABASE_URL="mysql://hk_nova:PASSWORD@localhost:3306/hk_nova_prod?connection_limit=20&pool_timeout=20&connect_timeout=10&socket_timeout=30"

# Explanation:
# connection_limit=20    - Max 20 connections in pool
# pool_timeout=20        - Wait 20s for connection from pool
# connect_timeout=10     - Connect to DB timeout (10s)
# socket_timeout=30      - Query timeout (30s)
```

**Files to Modify:**
- `src/lib/prisma.ts` - Update documentation
- `.env.example` - Add pool parameter examples
- `.env.production` - Add pool parameters to DATABASE_URL
- `INFRASTRUCTURE_REQUIREMENTS.md` - Document pool configuration

---

## 📅 IMPLEMENTATION TIMELINE

### Week 1: Security & Credentials
- Days 1-2: Credential security fixes
- Days 3-5: Encryption key management

### Week 2: Rate Limiting & Connection Management
- Days 1-2: Device rate limiter implementation
- Days 3-5: SSH connection pool implementation

### Week 3: Resilience & Error Handling
- Days 1-3: Circuit breaker pattern
- Days 4-5: Exponential backoff & retry logic

### Week 4: Database & Testing
- Days 1-2: Database connection pool
- Days 3-5: Integration testing of all fixes

---

## ✅ VALIDATION CHECKLIST

After implementing all fixes, verify:

- [ ] No credentials in `.env.production` file
- [ ] All encryption keys in secure vault
- [ ] Password policy enforced (16+ chars, complexity)
- [ ] Device rate limiter prevents concurrent ops
- [ ] SSH connection pool limits connections per device
- [ ] Circuit breaker opens after failures
- [ ] Exponential backoff implemented
- [ ] Database connection pool configured
- [ ] All integration tests pass
- [ ] Load test with 100 devices succeeds
- [ ] No connection exhaustion under load
- [ ] Worker crash recovery works

---

## 📞 ESCALATION

If any critical fix takes longer than estimated or encounters blockers:

1. **Technical Blocker:** Escalate to senior developer
2. **Design Decision:** Escalate to architect
3. **Business Impact:** Escalate to product owner
4. **Timeline Risk:** Escalate to project manager

**Do not proceed to production without completing ALL P0 fixes.**

---

**Document Owner:** DevOps/SRE Team  
**Review Date:** After each fix is implemented  
**Sign-off Required:** Tech Lead + Security Team
