# Resolusi Analytics

Resolusi Analytics: 135 pemeriksaan regresi backend, 22 skenario browser, dan 7 tes API existing lulus. PDF diperiksa: total 28, reliability 57,14%, A4 dan header tabel lanjutan benar.

Semantik metrik: success dan unchanged dianggap berhasil; in_progress dikecualikan dari statistik hasil. Grade: Excellent ≥95%, Good ≥90%, Fair ≥80%, Poor <80%. Fastest Device memakai durasi job yang hanya menangani satu perangkat; tanpa bukti timing ditampilkan N/A. Rentang tanggal menggunakan UTC, end_date inklusif. Validasi lokal dengan fixture terisolasi, belum deployment produksi.

Perubahan pada app/routers/analytics.py, app/templates/analytics/dashboard.html, dan app/templates/base.html.

Reproduksi: `.venv/bin/python artifacts/analytics-qa/regression.py` dan `.venv/bin/python artifacts/analytics-qa/run_browser.py`.
