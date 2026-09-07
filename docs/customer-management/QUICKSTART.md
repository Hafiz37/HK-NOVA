# Customer Management - Quickstart Guide

Panduan cepat 5 menit untuk memulai pengelolaan customer di HK-NOVA NOC Platform.

---

## 🚀 Alur Kerja Utama (5 Menit)

### 1. Membuka Halaman Customer Management
1. Login ke HK-NOVA Dashboard dengan akun **OPERATOR** atau **ADMIN**.
2. Pada menu navigasi utama, klik **Customers** (atau buka `/dashboard/customers`).

### 2. Menambah Customer Baru (Provisioning)
1. Di halaman Customer List, klik tombol **+ Tambah Customer**.
2. **Langkah 1 (Info Customer):** Isi Username, Nama Lengkap, Nomor HP, dan Email. Klik **Next**.
3. **Langkah 2 (Service Config):** Pilih **PPPoE** atau **DHCP**.
   - Untuk **PPPoE**: Isi Password PPPoE dan Profile.
   - Untuk **DHCP**: Isi IP Address dan MAC Address.
4. **Langkah 3 (Package & Device):** Pilih Paket Bandwidth (misal: 10Mbps) dan pilih Router MikroTik tujuan. Klik **Next**.
5. **Langkah 4 (Review & Submit):**
   - Klik **Test (Dry-run)** untuk menguji validasi tanpa mengubah Router.
   - Klik **Buat Customer** untuk memproses pembuatan akun dan auto-provisioning ke Router MikroTik.

### 3. Mengubah Status Customer (Suspend & Reactivate)
- **Suspend (Isolasi Pelanggan):**
  1. Buka Detail Customer yang aktif.
  2. Klik tombol **Suspend Customer**.
  3. Masukkan alasan (opsional), lalu klik **Konfirmasi**.
  4. Akun PPPoE di MikroTik otomatis di-disable.

- **Reactivate (Aktivasi Kembali):**
  1. Buka Detail Customer yang ter-suspend.
  2. Klik tombol **Reactivate Customer**.
  3. Akun PPPoE di MikroTik otomatis di-enable kembali.

---

## ❓ FAQ & Troubleshooting Cepat

- **Q: Mengapa provisioning ke MikroTik gagal?**
  - **A:** Pastikan Router MikroTik dapat dijangkau (status UP), API service di MikroTik aktif (port 8728), dan credentials di Device Settings sudah benar.
- **Q: Apakah data tersimpan jika MikroTik offline saat create customer?**
  - **A:** Ya, customer tetap tersimpan di database HK-NOVA dengan status **PENDING**. Anda dapat melakukan re-provisioning setelah Router online.
