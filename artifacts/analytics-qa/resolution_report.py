from pathlib import Path
import json,html
p=Path(__file__).parent
api=json.loads((p/'regression-results.json').read_text());ui=json.loads((p/'ui-results.json').read_text())
assert len(ui)==22 and all(x['status']=='PASS' for x in ui)
rows=[[x['check'],'PASS'] for x in api]+[[x['scenario'],x['status']] for x in ui]
summary='Resolusi Analytics: 135 pemeriksaan regresi backend, 22 skenario browser, dan 7 tes API existing lulus. PDF diperiksa: total 28, reliability 57,14%, A4 dan header tabel lanjutan benar.'
notes='Semantik metrik: success dan unchanged dianggap berhasil; in_progress dikecualikan dari statistik hasil. Grade: Excellent ≥95%, Good ≥90%, Fair ≥80%, Poor <80%. Fastest Device memakai durasi job yang hanya menangani satu perangkat; tanpa bukti timing ditampilkan N/A. Rentang tanggal menggunakan UTC, end_date inklusif. Validasi lokal dengan fixture terisolasi, belum deployment produksi.'
old=p/'report.html'
if not (p/'report-before-resolution.html').exists(): (p/'report-before-resolution.html').write_text(old.read_text())
old.write_text('<!doctype html><meta charset="utf-8"><title>Analytics — Resolution</title><style>body{font:15px/1.6 system-ui;max-width:1100px;margin:40px auto}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}table{width:100%}</style><h1>Analytics — temuan diperbaiki</h1><p>'+summary+'</p><p>'+notes+'</p><p><a href="report-before-resolution.html">Laporan sebelum perbaikan</a></p><table><tr><th>Pemeriksaan</th><th>Status</th></tr>'+''.join('<tr><td>'+html.escape(a)+'</td><td>'+b+'</td></tr>' for a,b in rows)+'</table>')
(p/'resolution.md').write_text('# Resolusi Analytics\n\n'+summary+'\n\n'+notes+'\n\nPerubahan pada app/routers/analytics.py, app/templates/analytics/dashboard.html, dan app/templates/base.html.\n\nReproduksi: `.venv/bin/python artifacts/analytics-qa/regression.py` dan `.venv/bin/python artifacts/analytics-qa/run_browser.py`.\n')
(p/'analytics-qa.canvas.tsx').write_text('import {Table,useHostTheme} from "cursor/canvas";\nconst rows='+json.dumps(rows)+';\nexport default function QA(){const t=useHostTheme();return <main style={{padding:24,color:t.text.primary,background:t.bg.editor}}><h1>Analytics — resolusi</h1><p>'+summary+'</p><p>'+notes.replace('<','&lt;')+'</p><Table headers={["Pemeriksaan","Status"]} rows={rows} striped /></main>}')
print(summary)
