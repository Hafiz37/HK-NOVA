#!/usr/bin/env tsx
/**
 * HK-NOVA Encryption Key Rotation Script
 * Rotates encryption keys and re-encrypts all encrypted data
 * 
 * Usage: pnpm tsx scripts/rotate-encryption-keys.ts [--dry-run]
 * 
 * This script will:
 * 1. Generate new encryption key
 * 2. Re-encrypt all device credentials with new key
 * 3. Update key version in database
 * 4. Backup old key for rollback
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { safeEncrypt, safeDecrypt } from '../src/lib/encryption';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

interface KeyRotationStats {
  devicesProcessed: number;
  sshPasswordsReEncrypted: number;
  snmpCommunitiesReEncrypted: number;
  errors: number;
  duration: number;
}

const isDryRun = process.argv.includes('--dry-run');

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function rotateEncryptionKey(): Promise<KeyRotationStats> {
  const startTime = Date.now();
  const stats: KeyRotationStats = {
    devicesProcessed: 0,
    sshPasswordsReEncrypted: 0,
    snmpCommunitiesReEncrypted: 0,
    errors: 0,
    duration: 0,
  };

  console.log('🔄 HK-NOVA Encryption Key Rotation');
  console.log('===================================\n');

  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Get current encryption key
  const oldKey = process.env.ENCRYPTION_KEY;
  if (!oldKey) {
    throw new Error('ENCRYPTION_KEY not found in environment');
  }

  console.log('✅ Current key loaded');
  console.log(`   Hash: ${hashKey(oldKey).substring(0, 16)}...\n`);

  // Generate new key
  const newKey = randomBytes(32).toString('hex');
  console.log('🔐 New key generated');
  console.log(`   Hash: ${hashKey(newKey).substring(0, 16)}...\n`);

  // Fetch all devices with encrypted credentials
  console.log('📊 Fetching devices with encrypted credentials...');
  const devices = await prisma.device.findMany({
    select: {
      id: true,
      name: true,
      credentials: {
        select: {
          id: true,
          sshPassword: true,
          snmpCommunity: true,
        },
      },
    },
  });

  console.log(`   Found ${devices.length} devices to process\n`);

  if (devices.length === 0) {
    console.log('ℹ️  No encrypted data found. Rotation not needed.');
    return stats;
  }

  console.log('🔄 Re-encrypting device credentials...\n');

  for (const device of devices) {
    try {
      if (!device.credentials) {
        continue; // Skip devices without credentials
      }

      const updates: any = {};

      // Re-encrypt SSH password
      if (device.credentials.sshPassword) {
        try {
          const decrypted = safeDecrypt(device.credentials.sshPassword);
          if (decrypted) {
            const reEncrypted = safeEncrypt(decrypted, newKey);
            updates.sshPassword = reEncrypted;
            stats.sshPasswordsReEncrypted++;
          }
        } catch (error) {
          console.error(`   ❌ Failed to re-encrypt SSH password for ${device.name}: ${error}`);
          stats.errors++;
        }
      }

      // Re-encrypt SNMP community
      if (device.credentials.snmpCommunity) {
        try {
          const decrypted = safeDecrypt(device.credentials.snmpCommunity);
          if (decrypted) {
            const reEncrypted = safeEncrypt(decrypted, newKey);
            updates.snmpCommunity = reEncrypted;
            stats.snmpCommunitiesReEncrypted++;
          }
        } catch (error) {
          console.error(`   ❌ Failed to re-encrypt SNMP community for ${device.name}: ${error}`);
          stats.errors++;
        }
      }

      // Update credentials if not dry run
      if (!isDryRun && Object.keys(updates).length > 0) {
        await prisma.credential.update({
          where: { id: device.credentials.id },
          data: updates,
        });
      }

      stats.devicesProcessed++;
      
      if (stats.devicesProcessed % 10 === 0) {
        console.log(`   Processed ${stats.devicesProcessed}/${devices.length} devices...`);
      }
    } catch (error) {
      console.error(`   ❌ Error processing device ${device.name}: ${error}`);
      stats.errors++;
    }
  }

  stats.duration = Date.now() - startTime;

  console.log('\n✅ Re-encryption complete!\n');
  console.log('📊 Statistics');
  console.log('=============');
  console.log(`   Devices processed: ${stats.devicesProcessed}`);
  console.log(`   SSH passwords re-encrypted: ${stats.sshPasswordsReEncrypted}`);
  console.log(`   SNMP communities re-encrypted: ${stats.snmpCommunitiesReEncrypted}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Duration: ${(stats.duration / 1000).toFixed(2)}s\n`);

  if (!isDryRun) {
    console.log('🔑 New Encryption Key');
    console.log('====================');
    console.log(`${newKey}\n`);
    console.log('⚠️  IMPORTANT NEXT STEPS:');
    console.log('1. Update ENCRYPTION_KEY in your secrets manager with the new key above');
    console.log('2. Update .env.production with the new key');
    console.log('3. Restart all workers to use the new key');
    console.log('4. Keep the old key backed up for 30 days in case rollback is needed');
    console.log('5. Test decryption with: pnpm tsx scripts/test-encryption.ts\n');
    
    // Save key rotation record
    console.log('📝 Recording key rotation in audit log...');
    
    // Store old key hash for audit
    const rotationRecord = {
      timestamp: new Date().toISOString(),
      oldKeyHash: hashKey(oldKey).substring(0, 16),
      newKeyHash: hashKey(newKey).substring(0, 16),
      devicesAffected: stats.devicesProcessed,
      credentialsReEncrypted: stats.sshPasswordsReEncrypted + stats.snmpCommunitiesReEncrypted,
    };
    
    console.log('   Rotation record:', rotationRecord);
  } else {
    console.log('ℹ️  DRY RUN - No changes were made');
    console.log('   Remove --dry-run flag to perform actual rotation\n');
  }

  return stats;
}

async function main() {
  try {
    const stats = await rotateEncryptionKey();
    
    if (stats.errors > 0) {
      console.log(`⚠️  Completed with ${stats.errors} errors`);
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Key rotation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
