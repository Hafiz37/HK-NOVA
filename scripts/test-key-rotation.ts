#!/usr/bin/env tsx
/**
 * Test Key Rotation
 * Validates encryption key rotation with re-encryption
 */

import { PrismaClient } from '@prisma/client';
import { safeEncrypt, safeDecrypt } from '../src/lib/encryption';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function testKeyRotation() {
  console.log('🔄 Testing Key Rotation Process\n');
  
  // Step 1: Create test data with old key
  const oldKey = process.env.ENCRYPTION_KEY!;
  const testPassword = 'TestP@ssw0rd123!';
  
  console.log('Step 1: Encrypt with old key');
  const encryptedOld = safeEncrypt(testPassword, oldKey);
  console.log(`  ✓ Encrypted: ${encryptedOld.substring(0, 32)}...`);
  
  // Step 2: Verify decryption with old key
  console.log('\nStep 2: Verify decryption with old key');
  const decryptedOld = safeDecrypt(encryptedOld, oldKey);
  if (decryptedOld === testPassword) {
    console.log('  ✓ Decryption successful');
  } else {
    console.log('  ✗ Decryption failed');
    process.exit(1);
  }
  
  // Step 3: Generate new key
  console.log('\nStep 3: Generate new key');
  const newKey = randomBytes(32).toString('hex');
  console.log(`  ✓ New key: ${newKey.substring(0, 16)}...`);
  
  // Step 4: Decrypt with old key, re-encrypt with new key
  console.log('\nStep 4: Re-encrypt with new key');
  const decrypted = safeDecrypt(encryptedOld, oldKey);
  const encryptedNew = safeEncrypt(decrypted!, newKey);
  console.log(`  ✓ Re-encrypted: ${encryptedNew.substring(0, 32)}...`);
  
  // Step 5: Verify decryption with new key
  console.log('\nStep 5: Verify decryption with new key');
  const decryptedNew = safeDecrypt(encryptedNew, newKey);
  if (decryptedNew === testPassword) {
    console.log('  ✓ Decryption successful with new key');
  } else {
    console.log('  ✗ Decryption failed with new key');
    process.exit(1);
  }
  
  // Step 6: Test with multiple values
  console.log('\nStep 6: Test with multiple values');
  const testValues = [
    'SimplePassword123',
    'Complex!P@ssw0rd#2024',
    'Spëc!@l_Ch@rs$%^',
    '日本語パスワード',
  ];
  
  for (const value of testValues) {
    const enc = safeEncrypt(value, oldKey);
    const dec = safeDecrypt(enc, oldKey);
    const reEnc = safeEncrypt(dec!, newKey);
    const reDec = safeDecrypt(reEnc, newKey);
    
    if (reDec === value) {
      console.log(`  ✓ ${value.substring(0, 20)}...`);
    } else {
      console.log(`  ✗ Failed: ${value}`);
      process.exit(1);
    }
  }
  
  console.log('\n✅ All key rotation tests passed!');
  console.log('\nKey rotation process verified:');
  console.log('  1. Data encrypted with old key can be decrypted');
  console.log('  2. New key generated successfully');
  console.log('  3. Data re-encrypted with new key');
  console.log('  4. Data decrypted successfully with new key');
  console.log('  5. Multiple data types handled correctly');
}

testKeyRotation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
