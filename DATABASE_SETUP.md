# Setup Database HK-NOVA

Karena MySQL memerlukan password, silakan jalankan script berikut:

## Opsi 1: Setup Otomatis (Recommended)

```bash
cd /home/gopal-ichiro/Documents/magang/hk-nova
bash setup-mysql.sh
```

Script ini akan:
1. Meminta password MySQL Anda
2. Membuat database `hk_nova_dev`
3. Update file `.env` dengan password yang benar
4. Selesai!

Setelah itu, jalankan:

```bash
bash quick-setup.sh
```

Ini akan otomatis:
1. Push schema ke database
2. Generate Prisma Client
3. Seed demo data
4. Siap digunakan!

## Opsi 2: Setup Manual

Jika ingin manual, ikuti langkah berikut:

### 1. Buat Database

```bash
mysql -u root -p
# Masukkan password MySQL Anda
```

Lalu di MySQL prompt:

```sql
CREATE DATABASE hk_nova_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW DATABASES;
EXIT;
```

### 2. Update .env

Edit file `.env` dan update baris DATABASE_URL:

```bash
nano .env
```

Ubah:
```
DATABASE_URL="mysql://root:@localhost:3306/hk_nova_dev"
```

Menjadi:
```
DATABASE_URL="mysql://root:PASSWORD_ANDA@localhost:3306/hk_nova_dev"
```

Ganti `PASSWORD_ANDA` dengan password MySQL Anda.

Save dan keluar (Ctrl+X, Y, Enter).

### 3. Push Schema

```bash
export PATH=~/.npm-global/bin:$PATH
cd /home/gopal-ichiro/Documents/magang/hk-nova
pnpm db:push
```

### 4. Generate Prisma Client

```bash
pnpm generate
```

### 5. Seed Demo Data

```bash
pnpm db:seed
```

### 6. Test Aplikasi

```bash
pnpm dev
```

Buka: http://localhost:3000
Login: admin / admin123

---

## Troubleshooting

### Error: Access denied for user 'root'

Password MySQL salah. Periksa password di `.env`

### Error: Unknown database 'hk_nova_dev'

Database belum dibuat. Jalankan script setup-mysql.sh atau buat manual.

### Error: prisma command not found

Export PATH:
```bash
export PATH=~/.npm-global/bin:$PATH
```

---

## Quick Commands

```bash
# Setup database (otomatis)
bash setup-mysql.sh
bash quick-setup.sh

# Atau manual
mysql -u root -p
# CREATE DATABASE hk_nova_dev...
nano .env  # Update PASSWORD
pnpm db:push
pnpm generate
pnpm db:seed
pnpm dev
```
