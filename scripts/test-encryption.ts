#!/usr/bin/env tsx
/**
 * Test encryption/decryption with current keys
 * Verifies that encryption keys are working correctly
 */

import { safeEncrypt, safeDecrypt } from '../src/lib/encryption';

const testData = [
  { name: 'Simple password', value: 'MySecureP@ssw0rd123' },
  { name: 'SNMP community', value: 'public' },
  { name: 'Complex password', value: 'Xk9$mP2#qL8@vN4&wR7!yT1%zS5^aB3' },
  { name: 'Special characters', value: '!@#$%^&*()_+-=[]{}|;:,.<>?' },
  { name: 'Unicode text', value: 'Тест 测试 テスト' },
];

console.log('🔐 Encryption/Decryption Test');
console.log('=============================\n');

let passed = 0;
let failed = 0;

testData.forEach(test => {
  try {
    const encrypted = safeEncrypt(test.value);
    const decrypted = safeDecrypt(encrypted);
    
    if (decrypted === test.value) {
      console.log(`✅ ${test.name}: PASS`);
      passed++;
    } else {
      console.log(`❌ ${test.name}: FAIL (decrypted value mismatch)`);
      console.log(`   Expected: ${test.value}`);
      console.log(`   Got: ${decrypted}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${test.name}: FAIL (${error})`);
    failed++;
  }
});

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}/${testData.length}`);
console.log(`❌ Failed: ${failed}/${testData.length}`);
console.log('='.repeat(50) + '\n');

if (failed > 0) {
  console.log('❌ Encryption test failed!');
  console.log('   Check that ENCRYPTION_KEY is properly configured in .env\n');
  process.exit(1);
} else {
  console.log('✅ All encryption tests passed!\n');
  process.exit(0);
}
