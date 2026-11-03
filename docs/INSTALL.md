# Installation Guide

## Method 1: Quick Install (Recommended for Production)

One-command installation with systemd service:

```bash
curl -fsSL https://raw.githubusercontent.com/your-organization/hk-nova/main/install.sh | sudo bash
```

**What it does:**
- Installs Python 3.11+, git, and dependencies
- Creates dedicated `hk-nova` system user
- Clones repo to `/opt/hk-nova`
- Sets up Python virtual environment
- Generates secure `.env` with random admin password
- Creates systemd service with security hardening
- Starts the service on port 5005

**Access the web UI:**
```
http://<your-server-ip>:5005
Username: admin
Password: (shown during installation)
```

**Service management:**
```bash
sudo systemctl {start|stop|restart|status} hk-nova
sudo journalctl -u hk-nova -f  # View logs
```

Change account passwords through **Profile** (`/profile`) after login.
`AUTH_*` only sets the initial admin when the users table is empty.

**Management commands:**
```bash
cd /opt/hk-nova
./manage.sh status            # Show service status
./manage.sh logs              # View logs
```

**To update:**
```bash
curl -fsSL https://raw.githubusercontent.com/your-organization/hk-nova/main/install.sh | sudo bash
```

---

## Method 2: Git Clone + run.sh (Development)

For development, customization, or running without systemd:

```bash
git clone https://github.com/your-organization/hk-nova.git
cd hk-nova
./run.sh
```

**What it does:**
- Creates Python virtual environment (`.venv`)
- Installs dependencies from `requirements.txt`
- Creates `.env` from `.env.example` if missing
- Starts server on http://localhost:5005

**For production with this method:**
```bash
cp .env.example .env
# Edit .env to set AUTH_PASSWORD, SECRET_KEY, etc.
nano .env
./run.sh
```

---

## Method 3: Docker — Pre-built Image (Recommended)

Use the pre-built image from GitHub Container Registry — no need to clone the repo or build anything.

**1. Download the compose file:**
```bash
mkdir hk-nova && cd hk-nova
curl -fsSL https://raw.githubusercontent.com/your-organization/hk-nova/main/docker/image/docker-compose.yml -o docker-compose.yml
```

**2. Edit the environment variables directly in `docker-compose.yml`:**
```bash
nano docker-compose.yml
```

Change at minimum `SECRET_KEY` and `AUTH_PASSWORD`:
```yaml
    environment:
      - SECRET_KEY=change-me-to-a-random-secret-key
      - AUTH_PASSWORD=changeme-strong-password
      - CORS_ORIGINS=*
```

Generate a secure `SECRET_KEY`:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**3. Start:**
```bash
docker compose up -d
```

**Access:** http://localhost:5005

**To update:**
```bash
docker compose pull
docker compose up -d
```

**To run database migrations after an update** (required when upgrading to a new release that adds columns):
```bash
docker compose exec hk-nova alembic upgrade head
```

The migration command reads `DATABASE_URL` from the container environment automatically.

---

## Method 4: Docker — Build from Source

For development or customization, build the image yourself:

```bash
git clone https://github.com/your-organization/hk-nova.git
cd hk-nova
cp .env.example .env
# Edit .env to set AUTH_PASSWORD, SECRET_KEY, etc.
nano .env
cd docker/build
docker compose up -d --build
```

**To update:**
```bash
cd hk-nova
git pull
cd docker/build
docker compose up -d --build
```

---

## Building and Publishing the Image (maintainers)

To build a new image and push it to the container registry:

```bash
# From the repo root — builds, tags :1.5 + :latest, and pushes
bash docker/build-and-push.sh 1.5
```

The script will prompt for your registry credentials on first run. After it completes, `docker compose pull` in any Method 3 deployment will pick up the new image.

---

## Docker Volumes

All data is persistent across container restarts:

| Volume | Path in Container | Purpose |
|--------|-------------------|---------|
| `./data` | `/app/data` | SQLite database |
| `./backups` | `/app/backups` | Backup files |
| `./ssh_keys` | `/app/ssh_keys` | SSH keys for devices |

---

## Upgrading Docker Engine

If you have an old version of Docker installed (e.g. `docker-compose` v1), upgrade to the official Docker Engine:

```bash
# Remove old Docker packages
sudo apt remove docker docker-engine docker.io containerd runc

# Add Docker's official GPG key and repository
sudo apt update
sudo apt install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install latest Docker Engine with Compose plugin
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify
docker --version
docker compose version
```

> **Note:** The new Docker uses `docker compose` (with a space) instead of the old `docker-compose` (with a hyphen).

---

## Uninstallation

### Quick Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/your-organization/hk-nova/main/uninstall.sh | sudo bash
```

- Keeps backup data and database by default
- Asks before removing service user

### Manual Uninstall

```bash
sudo systemctl stop hk-nova
sudo systemctl disable hk-nova
sudo rm -f /etc/systemd/system/hk-nova.service
sudo rm -rf /opt/hk-nova
sudo userdel hk-nova  # optional
sudo systemctl daemon-reload
```

## Inisialisasi tabel users

1. Atur `DATABASE_URL`, `AUTH_USERNAME`, dan `AUTH_PASSWORD` pada `.env`
   sebelum startup pertama. Environment proses memiliki prioritas atas `.env`.
2. Dari root project, aktifkan `.venv`, jalankan `pip install -r requirements.txt`,
   backup database, lalu jalankan `alembic upgrade head`.
3. Jalankan `./start.sh` atau `./run.sh`. Keduanya memakai lifespan aplikasi
   yang memanggil `init_db()` dan provisioning admin. Menjalankan Alembic saja
   membuat tabel; seeding terjadi pada inisialisasi aplikasi.
4. Periksa `alembic current`: revision terbaru adalah `m3n4o5p6q7r8`.
   Log first-run menampilkan `Created initial administrator from AUTH_USERNAME configuration`.
   Query berikut memeriksa akun tanpa menampilkan hash/password:

   ```sql
   SELECT id, username, role, is_active, created_at FROM users;
   ```

Seeding hanya berjalan ketika tabel benar-benar kosong, termasuk jika akun
existing semuanya nonaktif. Restart tidak mereset akun. Pada instalasi kosong,
alur startup lama masih menggunakan `metadata.create_all`; jalankan migration
Alembic sebelum startup pertama agar riwayat revision tercatat sejak awal.
Database lama tanpa `alembic_version` perlu rekonsiliasi schema sebelum upgrade;
jangan melakukan `stamp head` tanpa memastikan kesesuaian schema.

Migration users menggunakan tipe lintas SQLite/PostgreSQL. Deployment yang
diverifikasi untuk perubahan ini memakai SQLite. Dukungan PostgreSQL aplikasi
secara menyeluruh belum siap: koneksi dan migration legacy masih mengandung
opsi/SQL khusus SQLite. Jangan menganggap migration users menghilangkan batasan tersebut.

Login web dan HTTP Basic sekarang memakai akun aktif di tabel `users`. Setelah
upgrade, restart aplikasi dan login kembali: cookie session lama tidak berlaku.
Jika tabel users sudah berisi akun dari provisioning sebelumnya, akun tersebut
dipertahankan. Perubahan `.env` tidak mengubah password akun tersebut. Admin dapat
membuat akun tambahan di `/users` dan mengganti password sendiri di `/profile`.
Deployment memerlukan restart; data device/backup tidak dihapus oleh migration users.
Pertahankan `SECRET_KEY` agar credential perangkat tetap dapat didekripsi.
