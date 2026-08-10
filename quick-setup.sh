#!/bin/bash
# Quick setup script - jalankan setelah database sudah dibuat

echo "================================================"
echo "  HK-NOVA Quick Setup"
echo "================================================"
echo ""

# Set PATH
export PATH=~/.npm-global/bin:$PATH

cd /home/gopal-ichiro/Documents/magang/hk-nova

echo "1. Pushing database schema..."
pnpm db:push

if [ $? -ne 0 ]; then
    echo "❌ Error pushing schema. Periksa DATABASE_URL di .env"
    exit 1
fi

echo ""
echo "2. Generating Prisma Client..."
pnpm generate

echo ""
echo "3. Seeding demo data..."
pnpm db:seed

echo ""
echo "================================================"
echo "  ✅ Setup Complete!"
echo "================================================"
echo ""
echo "Aplikasi siap digunakan!"
echo ""
echo "Untuk menjalankan:"
echo "  pnpm dev"
echo ""
echo "Lalu buka: http://localhost:3000"
echo "Login: admin / admin123"
echo ""
