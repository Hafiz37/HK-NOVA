# Flowchart HK-NOVA versi 3 — ringkas

Diagram utama tetap satu file: `flowchart-v3.mmd`. Urutannya adalah login → dashboard → kredensial SSH → destination Telegram → kelompok mitra → perangkat dan uji SSH → jadwal → monitoring. Data yang sudah siap dapat digunakan kembali; alur ini menggambarkan penyiapan awal, bukan kewajiban membuat ulang data setiap login.

Tampilan dipadatkan menjadi dua bagian dalam diagram yang sama: penggunaan NOC dan eksekusi backup. Detail formulir, CRUD, validasi, filter, versioning, kompresi, dan pemrosesan banyak perangkat berada di dalam subproses. Definisi lengkap subproses ditulis sebagai komentar `%%` di file Mermaid agar seluruh kebutuhan tetap terpetakan tanpa memperpanjang tampilan.

## Pemetaan kebutuhan

- HKN-001: LOGIN dan VALID — masukan kredensial, validasi, error, masuk dashboard.
- HKN-002: DEVICE — tambah perangkat pusat/mitra, IP, jenis, kredensial, simpan ke database.
- HKN-003: CREDENTIALS — tambah/ubah/hapus kredensial SSH, enkripsi dan simpan.
- HKN-004: GROUP dan DEVICE — kelompok mitra serta penyimpanan relasi perangkat.
- HKN-005: DEVICE — uji SSH, tampilkan status/error, perbaiki dan uji ulang.
- HKN-006: DESTINATION — kelola Local, Git, SMB, Telegram; tambah/ubah/hapus, validasi, simpan.
- HKN-007: DESTINATION — input, validasi, simpan bot token Telegram.
- HKN-008: GROUP dan BACKUP — chat ID mitra tervalidasi, pemetaan dan isolasi pengiriman.
- HKN-009: GROUP, BACKUP, SUCCESS, FAILED — pusat menerima file dan notifikasi semua perangkat.
- HKN-010: SCHEDULE dan TRIGGER — jadwal harian/mingguan/custom dan eksekusi sesuai waktu.
- HKN-011: BACKUP — SSH, command backup, simpan file lokal.
- HKN-012: BACKUP — hitung/bandingkan hash dan tandai perubahan.
- HKN-013: BACKUP dan SUCCESS — versi awal/perubahan dengan timestamp, hash, metadata, dan audit trail.
- HKN-014: BACKUP — gzip otomatis, pecah di atas 50 MB, upload ke mitra terkait dan pusat.
- HKN-015: SUCCESS dan FAILED — notifikasi Telegram berisi perangkat, timestamp, error bila ada.
- HKN-016: DASH dan MONITOR — status seluruh perangkat berhasil/gagal/pending, statistik mitra, backup terakhir.
- HKN-017: MONITOR — history/audit trail lengkap dan filter tanggal/perangkat/mitra.
- HKN-018: MONITOR — pilih dua versi, tampilkan diff baris demi baris.
- HKN-019: MONITOR — daftar/filter tanggal-perangkat/pencarian/unduhan Telegram untuk restore manual.
- HKN-020: FAILED, RETRY, WAIT, TRIGGER — alert detail error, tombol retry manual, retry otomatis terbatas.

## Arti simbol dan cabang

Kapsul menandai awal/akhir; jajar genjang adalah input/output; persegi panjang adalah proses; garis ganda adalah subproses. Setiap belah ketupat memiliki tepat dua cabang: **Iya** dan **Tidak**. Panah penuh menunjukkan urutan, sedangkan panah putus-putus dari monitoring menunjukkan permintaan manual, bukan langkah wajib setiap kali monitoring dibuka.

Subproses BACKUP memproses seluruh target dan mengembalikan hasil setiap perangkat. Jika sebagian gagal, hasil yang berhasil tetap dicatat dan diberitahukan; cabang gagal menampilkan kegagalan target terkait. Retry otomatis mengulang hanya target gagal dengan batas percobaan dan jeda sesuai policy. Tanpa izin retry otomatis, eksekusi selesai dan retry manual tetap tersedia. Menunggu jadwal baru bukan retry.

Scheduler berjalan mandiri; logout tidak menghentikan backup otomatis. Konfigurasi tidak berubah tetap diunggah dan dicatat, tanpa versi perubahan baru. Kegagalan unggahan tidak menghapus file lokal/versi yang sudah tersimpan. Restore berarti menyiapkan unduhan untuk pemulihan manual.

## Lingkup kesesuaian

Acuan utama adalah `../tabel/tabel_fungsional.md`. Seluruh kebutuhan dipetakan pada tingkat subproses; tidak semua detail digambar sebagai simbol tersendiri. Diagram ini merupakan rancangan kebutuhan, bukan bukti implementasi seluruh fitur. Kode aplikasi sebelumnya masih berbeda pada penyimpanan lokal wajib, kompresi/batas pemecahan Telegram, status keberhasilan kedua channel, notifikasi, retry menyeluruh, serta daftar/filter/unduhan Telegram.

Perubahan hanya pada diagram dan catatan. Folder `assets/diagram/` diabaikan oleh `.gitignore`.
