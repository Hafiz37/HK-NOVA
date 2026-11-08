# Use Case Diagram V2

Diagram `use_case_diagram.mmd` mencakup seluruh 16 fungsi tabel V2 dalam 14 use case. Semua label use case menggunakan kata kerja. Seluruh garis aktor ke use case tanpa keterangan; pemisahan fungsi menunjukkan perbedaan hak akses.

## Pemetaan ke tabel fungsional

- UC01 — Melakukan autentikasi login: HKN-001.
- UC02 — Memantau status dan analitik backup: HKN-002, HKN-011.
- UC03 — Mengelola perangkat dan kelompok perangkat: HKN-003, HKN-005.
- UC04 — Mengelola kredensial perangkat: HKN-004.
- UC05 — Mengelola destination storage backup: HKN-006.
- UC06 — Menjadwalkan backup otomatis: HKN-007.
- UC07 — Mengelola backup konfigurasi: HKN-008, bagian operasi backup.
- UC08 — Menangani kegagalan backup: HKN-012, bagian retry dan penandaan selesai.
- UC09 — Mengelola pengguna dan hak akses: HKN-013.
- UC10 — Melihat audit log: HKN-014.
- UC11 — Melihat riwayat, mengunduh backup, dan membandingkan versi konfigurasi: HKN-008 bagian lihat/unduh, HKN-009, HKN-015.
- UC12 — Mengelola backup multi-channel Telegram: HKN-016.
- UC13 — Melihat diagnosis kegagalan backup: HKN-012, bagian melihat diagnosis.
- UC14 — Mengelola notifikasi backup: HKN-010.

## Aktor dan hak akses

- **mitra (viewer):** UC01, UC02, UC11, dan UC13.
- **operator noc (operator):** mewarisi akses Viewer, ditambah UC03, UC06, UC07, UC08, UC12, dan UC14.
- **Manager NOC (admin):** mewarisi akses Operator, ditambah UC04, UC05, UC09, dan UC10.

Pengelolaan destination storage (Admin) dipisahkan dari pengaturan multi-channel Telegram melalui lokasi/mitra dan API Telegram khusus (Operator dan Admin). Melihat diagnosis dipisahkan dari tindakan retry/penyelesaian masalah. Dengan demikian, garis aktor tidak memerlukan label pembatasan.

Penamaan mitra (viewer) merujuk role Viewer yang ada; nama ini tidak menambahkan pembatasan data per mitra pada implementasi aplikasi. Akses kredensial dan destination mengikuti pembatasan `require_admin` pada kode proyek.

## Relasi antaraktor dan antar-use case

- Panah **mewarisi akses** hanya menghubungkan aktor, dari role dengan akses lebih luas ke role yang diwarisi. Label ini bukan keterangan pada garis aktor ke use case.
- **UC06 → «include» → UC07:** HKN-007 mencakup pengaturan dan pelaksanaan backup ketika jadwal tiba. Pelaksanaan jadwal menggunakan proses backup UC07. Menyimpan jadwal tidak langsung menjalankan backup; membuka riwayat dan mengunduh file juga bukan langkah wajib pelaksanaan backup.
- **UC08 → «extend»: backup gagal → UC07:** penanganan kegagalan memperluas skenario backup pada titik hasil backup yang gagal. Operator atau Admin dapat melakukan retry atau menandai masalah selesai bila diperlukan. Melihat diagnosis tersedia secara terpisah pada UC13.

UML memakai include dan extend, bukan exclude. Login merupakan prasyarat sesi, sehingga tidak perlu dihubungkan dengan include dari setiap fungsi. Diagram memakai notasi Mermaid flowchart sebagai representasi use case; pewarisan aktor ditunjukkan dengan panah berlabel, bukan simbol segitiga UML native.

## Cakupan rumusan masalah

Backup SSH terjadwal untuk pusat dan mitra tetap tercakup pada pengelolaan perangkat, kredensial, jadwal, dan backup. Hash SHA-256, pencatatan versi dan timestamp merupakan perilaku sistem sesuai HKN-015; pengguna mengakses riwayat serta unified diff melalui UC11. Pemisahan channel mitra dan monitoring pusat tetap tercakup pada UC12 sesuai HKN-016. UC10 adalah audit aktivitas pengguna, berbeda dari riwayat konfigurasi UC11.

Diagram memetakan kebutuhan dan akses role. Ketepatan change detection, isolasi pengiriman Telegram, dan efektivitas jadwal tetap harus dibuktikan melalui pengujian sistem.
