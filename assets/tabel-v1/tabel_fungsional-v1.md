| Kode | Fungsional | Deskripsi |
|------|------------|-----------|
| HKN-001 | Melakukan autentikasi login | User memasukkan username dan password untuk masuk ke dalam sistem; sistem memvalidasi kredensial lalu mengarahkan ke halaman dashboard |
| HKN-002 | Menambah data perangkat jaringan | Admin menambahkan data perangkat pusat atau mitra dengan informasi IP address, jenis perangkat, dan mitra terkait; sistem menyimpan ke database |
| HKN-003 | Mengelola kredensial SSH perangkat | Admin dapat menambah, mengubah, dan menghapus username dan password SSH untuk setiap perangkat; sistem mengenkripsi dan menyimpan kredensial |
| HKN-004 | Mengelompokkan perangkat per mitra | Admin dapat mengelompokkan perangkat jaringan berdasarkan mitra untuk memudahkan manajemen backup; sistem menyimpan relasi perangkat dengan mitra |
| HKN-005 | Menguji koneksi SSH ke perangkat | Admin melakukan test koneksi SSH ke perangkat jaringan; sistem mencoba koneksi dan menampilkan status berhasil atau gagal beserta pesan error |
| HKN-006 | Mengelola destination storage backup | Admin dapat menambah, mengubah, dan menghapus destination storage (Local, Git, SMB, Telegram) dengan konfigurasi masing-masing; sistem memvalidasi koneksi dan menyimpan konfigurasi destination |
| HKN-007 | Mengelola konfigurasi bot Telegram | Admin memasukkan bot token dan mengatur konfigurasi bot Telegram; sistem memvalidasi token dan menyimpan konfigurasi untuk integrasi backup |
| HKN-008 | Mengatur channel Telegram per mitra | Admin mengonfigurasi channel Telegram khusus untuk setiap mitra dengan chat ID; sistem memvalidasi koneksi dan menyimpan konfigurasi untuk isolasi data backup |
| HKN-009 | Mengatur channel monitoring pusat | Admin mengonfigurasi channel Telegram pusat untuk monitoring semua backup; sistem menyimpan chat ID channel untuk menerima notifikasi dan file backup dari semua perangkat |
| HKN-010 | Menjadwalkan backup otomatis perangkat | Admin mengatur jadwal backup harian, mingguan, atau custom untuk setiap perangkat; sistem menyimpan jadwal dan menjalankan backup sesuai waktu yang ditentukan |
| HKN-011 | Melakukan backup konfigurasi via SSH | Sistem terhubung ke perangkat jaringan via SSH sesuai jadwal; mengeksekusi command backup dan menyimpan hasil file konfigurasi ke storage lokal |
| HKN-012 | Mendeteksi perubahan konfigurasi | Sistem menghitung hash file backup baru dan membandingkan dengan versi sebelumnya; jika berbeda maka ditandai sebagai perubahan dan disimpan sebagai versi baru |
| HKN-013 | Menyimpan versi konfigurasi dengan timestamp | Sistem menyimpan setiap versi konfigurasi yang berubah dengan timestamp, hash, dan metadata perangkat; membentuk history versioning untuk audit trail |
| HKN-014 | Mengunggah backup ke channel Telegram sesuai mitra | Sistem mengunggah file backup ke channel Telegram sesuai mitra dengan compression gzip otomatis dan file splitting >50MB; memastikan isolasi data per mitra dan channel pusat menerima semua backup |
| HKN-015 | Mengirim notifikasi status backup | Sistem mengirim notifikasi ke channel Telegram terkait dengan status backup berhasil atau gagal; menyertakan informasi perangkat, timestamp, dan pesan error jika ada |
| HKN-016 | Menampilkan dashboard status backup | Sistem menampilkan ringkasan status backup semua perangkat dengan indikator berhasil, gagal, atau pending; menampilkan statistik backup per mitra dan waktu backup terakhir |
| HKN-017 | Melihat history log backup dan audit trail | User dapat melihat riwayat semua aktivitas backup dengan detail timestamp, perangkat, status, dan perubahan konfigurasi; sistem menyediakan filter berdasarkan tanggal, perangkat, atau mitra |
| HKN-018 | Menampilkan diff perubahan antar versi | User memilih dua versi konfigurasi dari history; sistem menampilkan perbedaan line-by-line dalam format diff viewer untuk analisis perubahan |
| HKN-019 | Melakukan restore backup dari Telegram | User dapat mencari dan mengunduh file backup dari channel Telegram; sistem menampilkan daftar backup yang tersedia dengan filter tanggal dan perangkat untuk proses restore konfigurasi |
| HKN-020 | Menampilkan alert backup gagal dan retry mechanism | Sistem menampilkan alert jika backup gagal dengan detail error; menyediakan tombol retry manual atau otomatis mencoba ulang sesuai konfigurasi retry policy |
