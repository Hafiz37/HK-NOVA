#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...\n');

  try {
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');

    const deviceCount = await prisma.device.count();
    const userCount = await prisma.user.count();
    const alertCount = await prisma.alert.count();

    console.log('📊 Database Statistics:');
    console.log(`   Devices: ${deviceCount}`);
    console.log(`   Users: ${userCount}`);
    console.log(`   Alerts: ${alertCount}`);
    console.log('');

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length !== 64) {
      console.log('⚠️  ENCRYPTION_KEY is not properly set!');
      console.log('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      console.log('');
    } else {
      console.log('✅ ENCRYPTION_KEY is properly configured\n');
    }

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!telegramToken) {
      console.log('⚠️  TELEGRAM_BOT_TOKEN not set (notifications disabled)');
      console.log('');
    } else {
      console.log('✅ TELEGRAM_BOT_TOKEN is configured\n');
    }

    console.log('🎉 Setup verification complete!\n');
    console.log('Next steps:');
    console.log('  1. Run: pnpm dev');
    console.log('  2. Open: http://localhost:3000');
    console.log('  3. Login with: admin / admin123');
    console.log('');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testDatabaseConnection();
