#!/bin/bash
# Script untuk setup database HK-NOVA
# Jalankan dengan: bash setup-mysql.sh

echo "================================================"
echo "  HK-NOVA Database Setup"
echo "================================================"
echo ""

# Prompt untuk password MySQL
read -sp "Masukkan password MySQL root: " MYSQL_PASSWORD
echo ""

# Buat database
echo "Membuat database hk_nova_dev..."
mysql -u root -p"$MYSQL_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS hk_nova_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Database 'hk_nova_dev' berhasil dibuat!"
    
    # Update .env file
    echo ""
    echo "Mengupdate file .env..."
    
    # Escape special characters in password
    ESCAPED_PASSWORD=$(echo "$MYSQL_PASSWORD" | sed 's/[&/\]/\\&/g')
    
    # Update DATABASE_URL
    sed -i "s|DATABASE_URL=\"mysql://root:@localhost:3306/hk_nova_dev\"|DATABASE_URL=\"mysql://root:$ESCAPED_PASSWORD@localhost:3306/hk_nova_dev\"|g" .env
    
    echo "✅ File .env berhasil diupdate!"
    echo ""
    echo "================================================"
    echo "  Setup Database Selesai!"
    echo "================================================"
    echo ""
    echo "Langkah selanjutnya:"
    echo "1. export PATH=~/.npm-global/bin:\$PATH"
    echo "2. pnpm db:push"
    echo "3. pnpm generate"
    echo "4. pnpm db:seed"
    echo "5. pnpm dev"
    echo ""
else
    echo "❌ Gagal membuat database!"
    echo "   Periksa password MySQL Anda dan coba lagi."
    exit 1
fi
