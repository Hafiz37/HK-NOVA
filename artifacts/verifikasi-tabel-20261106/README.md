# Bukti verifikasi tabel HK-NOVA

Tanggal pelaksanaan: 6 November 2026, Asia/Jakarta.

- `results.xml` dan `tests.log`: 82 tes existing dieksekusi, 74 lulus dan 8 gagal. Seluruh kegagalan berada pada `test_credential_audit.py`, yang menggunakan fixture Operator untuk tindakan khusus Admin. Tidak ada perubahan test atau kode aplikasi untuk menyembunyikan kegagalan.
- `rows.json`, `rows.log`, `verify_rows.py`: delapan pemeriksaan tambahan melalui HTTP TestClient. Seluruh pemeriksaan dalam skrip lulus setelah melengkapi destination fixture perangkat. BB-019 dan BB-024 belum mencakup seluruh kriteria; kelulusan assertion skrip bukan kelulusan otomatis seluruh baris tabel.
- `storage.json`, `storage.log`, `check_storage.py`: probe lanjutan mengonfirmasi 100 byte pada periode kosong, melanggar kriteria periode penyimpanan BB-019/INT-010.
- Tabel fungsional: 6 Lulus, 1 Tidak Lulus, 23 Belum diverifikasi penuh. Tabel integrasi: 1 Lulus, 1 Tidak Lulus, 8 Belum diverifikasi penuh. Jumlah tes otomatis tidak sama dengan jumlah kasus tabel.

## Lingkungan dan metode

Python `.venv/bin/python` milik proyek. Database, BACKUP_DIR, SSH_KEY_DIR, akun, dan data fixture terpisah di `/tmp/hkn-verification-20261106/`. Database aplikasi pengguna tidak digunakan. TestClient dijalankan tanpa lifespan scheduler produksi. Sejumlah suite memock engine, tujuan, dan notifikasi; lihat keterangan pada setiap baris tabel. Pemeriksaan dilakukan pada handler HTTP dan template, bukan browser visual.

Sandbox awal membuat TestClient tertahan; proses dihentikan dan eksekusi terisolasi diulang di luar sandbox. Tes lokal memerlukan thread/event loop TestClient berjalan normal.

Suite yang dieksekusi:

```text
.venv/bin/python -m pytest tests/test_auth_audit.py tests/test_user_audit.py tests/test_device_audit.py tests/test_credential_audit.py tests/test_audit_logs_router.py tests/test_other_resources_audit.py tests/test_backup_audit.py tests/test_backup_failure_flow.py tests/test_retry_logic.py tests/test_diagnostic_analyzer.py -q -o addopts= -p no:cacheprovider --basetemp=/tmp/hkn-verification-20261106/pytest2 --junitxml=/tmp/hkn-verification-20261106/results.xml
```

Variabel lingkungan yang dipasang: DATABASE_URL menuju SQLite sementara, BACKUP_DIR/SSH_KEY_DIR menuju direktori uji, SECRET_KEY serta akun bootstrap khusus fixture, dan PYTHONDONTWRITEBYTECODE=1. Jangan menjalankan perintah suite dengan konfigurasi database produksi. Skrip pemeriksaan tambahan memuat path fixture tetap; gunakan direktori uji baru atau bersihkan hanya database fixture milik skrip sebelum reproduksi agar tidak terjadi akun duplikat. Probe storage dijalankan setelah verify_rows.py, menggunakan database fixture yang sama.

## Temuan dan keterbatasan

1. API `/api/v1/analytics/storage-usage` mengabaikan rentang tanggal: data fixture 1 Oktober 2026 masih dihitung untuk 1 Januari 2099. Nilai aktual 100 byte/1 backup; nilai harapan periode kosong 0 byte/0 backup.
2. Tes kredensial perlu diselaraskan dengan peran Admin pada kebutuhan sekarang; HTTP 403 untuk Operator merupakan pembatasan yang benar.
3. Belum dilakukan SSH perangkat nyata, pengiriman Telegram nyata, atau akses Git/SMB nyata. Jadwal otomatis, seluruh rangkaian versioning, fallback nyata, dan sejumlah subkasus lain belum dibuktikan. Tidak diberi status Lulus hanya berdasarkan kode atau mock.
