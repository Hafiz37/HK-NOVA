# MySQL credentials - update dengan kredensial MySQL Anda
read -sp "Enter MySQL root password: " MYSQL_PASSWORD
echo ""

# Buat database
mysql -u root -p"$MYSQL_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS hk_nova_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database 'hk_nova_dev' created successfully"
else
    echo "❌ Failed to create database. Please create manually:"
    echo "   mysql -u root -p"
    echo "   CREATE DATABASE hk_nova_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    exit 1
fi

# Generate encryption key jika belum ada
if ! grep -q "ENCRYPTION_KEY=" .env; then
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "ENCRYPTION_KEY=\"$ENCRYPTION_KEY\"" >> .env
    echo "✅ Generated ENCRYPTION_KEY"
fi

echo ""
echo "🚀 Setup complete! Run these commands:"
echo "   pnpm db:push"
echo "   pnpm generate"
echo "   pnpm db:seed"
echo "   pnpm dev"
