| Kode | Fungsional | Deskripsi |
|------|------------|-----------|
| HKN-001 | Melakukan autentikasi login | User memasukkan username dan password; sistem memvalidasi kredensial dan memberikan akses sesuai peran pengguna |
| HKN-002 | Menampilkan dashboard status backup | Sistem menampilkan ringkasan perangkat pusat dan mitra, status backup, dan aktivitas backup terbaru untuk monitoring terpusat |
| HKN-003 | Mengelola perangkat jaringan | Admin atau Operator dapat menambah, mengubah, dan menghapus perangkat pusat maupun mitra serta menguji koneksi SSH perangkat |
| HKN-004 | Mengelola kredensial perangkat | Admin mengelola kredensial SSH perangkat; sistem mengenkripsi dan menyimpan data sensitif |
| HKN-005 | Mengelompokkan perangkat | Admin atau Operator mengelompokkan perangkat pusat dan perangkat masing-masing mitra untuk memudahkan pengaturan jadwal serta tujuan penyimpanan backup |
| HKN-006 | Mengelola destination storage backup | Admin dapat menambah, mengubah, menguji, dan menghapus tujuan penyimpanan backup Local, Git, SMB, atau Telegram |
| HKN-007 | Menjadwalkan backup otomatis | Admin atau Operator mengatur jadwal backup perangkat pusat maupun mitra; sistem mengambil konfigurasi melalui SSH sesuai jadwal tanpa perlu menjalankan backup manual setiap hari |
| HKN-008 | Mengelola backup konfigurasi | Admin atau Operator dapat menjalankan backup manual melalui SSH bila diperlukan; User dapat melihat dan mengunduh hasil backup sesuai hak akses |
| HKN-009 | Melihat riwayat pekerjaan backup | User melihat riwayat pelaksanaan pekerjaan backup beserta waktu, status, dan hasilnya |
| HKN-010 | Mengelola notifikasi backup | Admin atau Operator mengatur saluran notifikasi; sistem mengirim pemberitahuan status backup |
| HKN-011 | Menampilkan analitik backup | Sistem menampilkan tren backup, tingkat keberhasilan, dan penggunaan penyimpanan berdasarkan periode yang dipilih |
| HKN-012 | Menangani kegagalan backup | Sistem menampilkan diagnosis kegagalan; Admin atau Operator dapat menjalankan ulang backup dan menandai masalah selesai |
| HKN-013 | Mengelola pengguna dan hak akses | Admin mengelola akun pengguna, status akun, dan peran Admin, Operator, atau Viewer |
| HKN-014 | Melihat audit log | Admin melihat catatan aktivitas pengguna dan perubahan data untuk memantau penggunaan sistem |
| HKN-015 | Melacak versi dan perubahan konfigurasi | Sistem membandingkan hash SHA-256 backup dengan versi sebelumnya dan mencatat versi konfigurasi beserta timestamp; User melihat riwayat perubahan dan unified diff antar versi sebagai audit trail untuk troubleshooting |
| HKN-016 | Mengelola backup multi-channel Telegram | Admin atau Operator mengatur channel Telegram per mitra dan channel monitoring pusat; sistem mengirim backup hanya ke channel mitra terkait serta channel pusat untuk menjaga pemisahan data antar mitra dan monitoring terpusat |
