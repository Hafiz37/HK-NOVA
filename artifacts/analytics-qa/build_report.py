import json,html
from pathlib import Path
P=Path(__file__).parent
rows=[]
for file in ['api-results.json','extra-results.json','ui-results.json']:rows+=json.loads((P/file).read_text())
notes=json.loads((P/'report-notes.json').read_text())
notes['bugs'] += [dict(id='B11',priority='P2',title='Tinggi chart mobile tidak mengikuti 250px',detail='Viewport 768/576/375 tidak overflow horizontal, tetapi SVG chart tetap 350px dan container 365px; gauge sekitar 258,7px. Atur responsive ApexCharts dan min-height container, bukan hanya CSS height.',source='app/templates/analytics/dashboard.html:58'),dict(id='B12',priority='P3',title='Console initial load mengandung favicon 404',detail='Delapan fetch Analytics default berhasil HTTP 200, tanpa exception JS, tetapi /favicon.ico mengembalikan 404. Karena kriteria console bersih, skenario UI-DEFAULT dinilai FAIL; ini bukan kegagalan API Analytics.',source='app/templates/base.html')]
# Preserve raw evidence separately; compact notes for the reviewable table.
for r in rows:
    n=r['notes']; i=r['id']
    if i=='SEC-01':r['notes']='Seluruh 15 endpoint Analytics menolak anonymous dengan HTTP 401.'
    elif i=='EDGE-01':r['notes']='Seluruh 15 endpoint tidak crash; endpoint berparameter tanggal memakai fallback HTTP 200. Invalid format diuji 01/10/2026 dan not-date. Fallback tidak diberi peringatan.'
    elif i=='EDGE-03':r['notes']='Seluruh 15 endpoint termasuk empat ekspor memberi HTTP 200 pada database kosong; tidak ada ZeroDivisionError.'
    elif i=='UI-DEFAULT':r['notes']='Label default benar; 8 fetch Analytics HTTP 200. FAIL hanya karena console resource /favicon.ico HTTP 404; tidak ada pageerror JavaScript.'
    elif i.startswith('UI-RANGE-'):
        raw=json.loads(n);bad=[x['url'].split('/analytics/')[1]+' → '+str(x['status']) for x in raw['responses'] if x['status']!=200]
        r['notes']='Label berubah dan 8 fetch dipicu. '+('; '.join(bad) if bad else 'Semua HTTP 200 dan console bersih. Akurasi kalender diuji terpisah (TREND).')
    elif i=='UI-CUSTOM':r['notes']='1–7 Oktober: label tanggal berubah, pulsing dot animation=pulse muncul, 8 fetch HTTP 200. Ini PASS kontrol UI; akurasi angka FAIL pada INT-01.'
    elif i=='UI-REFRESH':r['notes']='8 fetch baru memakai days=7 dan tanggal custom. Navigasi tetap 1; halaman tidak reload.'
    elif i=='UI-SAMEDAY':r['notes']='Apply Range mengirim days=1; 7 dari 8 fetch HTTP 422, hanya anomalies HTTP 200. Toast sukses custom tetap muncul.'
    elif i=='UI-REVERSE':r['notes']='Memanggil applyCustomRange dengan Start > End memunculkan Start date must be before end date; tidak ada fetch baru. Pengujian guard memakai pengisian DOM terkontrol.'
    elif i=='UI-OVER365':r['notes']='Memanggil applyCustomRange dengan rentang >365 memunculkan Date range cannot exceed 365 days; tidak ada fetch baru. API langsung tetap tidak membatasi (VALID-over365).'
    elif i=='UI-ZERO':r['notes']='Reload database kosong: console bersih, top No data available, problematic All devices performing well!, badge 0, KPI N/A, banner anomali hidden.'
    elif i.startswith('UI-MOBILE'):
        v=json.loads(n);r['notes']=f'Viewport/scrollWidth sama {v["viewport"]}px: tidak horizontal overflow. SVG 4 chart tetap 350px (container 365px); gauge 258,7px. Expected 250px.'
    elif i=='EXP-FILTER-pdf':r['notes']='Expected total 28; teks PDF dan render terverifikasi menunjukkan Total Backups 56.'
    r['notes']=r['notes'].replace('\x1b','')
passed=sum(x['status']=='PASS' for x in rows);failed=len(rows)-passed
notes['summary']=f'{len(rows)} skenario/check: {passed} PASS, {failed} FAIL. Tidak ada skenario tercatat yang ditandai PASS tanpa eksekusi atau inspeksi bukti; KPI-02 menyertakan inspeksi implementasi. Beberapa FAIL berasal dari akar masalah yang sama.'
(P/'report-data.json').write_text(json.dumps({'notes':notes,'results':rows},indent=2,ensure_ascii=False))
summary=f"{notes['decision']}. {notes['summary']}"
head='''<!DOCTYPE html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QA Analytics HK-NOVA</title><style>body{font:15px/1.55 system-ui;margin:32px auto;max-width:1280px;padding:0 24px;color:#19212b}h1{font-size:24px}h2{font-size:20px;margin-top:30px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px;border:1px solid #d2d8de;text-align:left;vertical-align:top}th{background:#eff2f4;position:sticky;top:0}td:first-child{white-space:nowrap}.FAIL{font-weight:700;color:#9e2424}.PASS{color:#136139}small{color:#53606c}.summary{padding:18px;background:#f1f3f5}a{color:#155f9e}details{margin:12px 0}pre{white-space:pre-wrap}@media print{th{position:static}body{max-width:none;margin:0}}</style>'''
content=f'<h1>Pengujian sistem Analytics — HK-NOVA</h1><p class="summary"><b>{html.escape(summary)}</b></p><h2>Executive Summary</h2><p>Rilis perlu ditunda karena integritas periode dan angka laporan belum terjamin. Autentikasi, operasi ekspor, refresh tanpa reload, dan penanganan database kosong bekerja. Prioritas rilis: batas tanggal/kontrak range, konsistensi status backup, daftar perangkat bermasalah, lalu spesifikasi visual dan mobile.</p><p>{html.escape(notes["scope"])}</p><p>{html.escape(notes["fixture"])}</p><p><small>{html.escape(notes["limitations"])}</small></p><h2>Hasil pengujian</h2><table><thead><tr><th>Test ID</th><th>Deskripsi Skenario</th><th>Status: PASS/FAIL</th><th>Catatan &amp; Temuan Bug/Kendala</th></tr></thead><tbody>'
for r in rows:content+='<tr>'+''.join('<td'+(' class="'+r['status']+'"' if k=='status' else '')+'>'+html.escape(r[k])+'</td>' for k in ['id','scenario','status','notes'])+'</tr>'
content+='</tbody></table><h2>Temuan dan prioritas</h2>'
for b in notes['bugs']:content+=f'<details open><summary><b>{b["id"]} · {b["priority"]} · {html.escape(b["title"])}</b></summary><p>{html.escape(b["detail"])}</p><small>{b["source"]}</small></details>'
content+='''<h2>Bukti &amp; reproduksi</h2><p><a href="desktop.png">Desktop</a> · <a href="mobile-375.png">Mobile 375px</a> · <a href="zero-data.png">Database kosong</a> · <a href="export.pdf">PDF API</a> · <a href="export.xlsx">Excel API</a> · <a href="export.csv">CSV API</a> · <a href="export.json">JSON API</a> · <a href="api-results.json">Raw API</a> · <a href="ui-results.json">Raw UI</a></p><pre>.venv/bin/python artifacts/analytics-qa/probe.py
.venv/bin/python artifacts/analytics-qa/extra.py
.venv/bin/python artifacts/analytics-qa/run_browser.py</pre><p>Harness browser memakai Playwright bundled dan Google Chrome lokal; sesuaikan path jika dijalankan pada mesin lain. Server fixture hanya loopback dan berhenti otomatis. Kode aplikasi tidak diperbaiki dalam pekerjaan QA ini.</p></html>'''
(P/'report.html').write_text(head+content)
canvas='''import { useHostTheme, useCanvasState, Table, Button } from "cursor/canvas";
const data = DATA;
export default function AnalyticsQA() {
 const t=useHostTheme(); const [filter,setFilter]=useCanvasState<string>("status-filter","ALL");
 const shown=data.results.filter(r=>filter==="ALL"||r.status===filter);
 return <main style={{background:t.bg.editor,color:t.text.primary,padding:24,fontSize:14,lineHeight:1.55}}>
 <h1 style={{fontSize:24,marginBottom:8}}>HK-NOVA · Analytics QA</h1>
 <p style={{fontSize:20,color:t.accent.primary,fontWeight:600}}>{data.notes.decision}</p>
 <p>{data.notes.summary}</p>
 <p>Rilis perlu ditunda karena filter tanggal menghasilkan angka dan laporan yang salah. Autentikasi, unduhan, refresh, dan backend database kosong bekerja.</p>
 <details><summary>Lingkungan, fixture, dan batas pengujian</summary><p>{data.notes.scope}</p><p>{data.notes.fixture}</p><p>{data.notes.limitations}</p></details>
 <h2 style={{fontSize:18}}>Hasil pengujian · 3 November 2026</h2>
 <div style={{display:"flex",gap:8,marginBottom:16}}>{["ALL","PASS","FAIL"].map(s=><Button key={s} onClick={()=>setFilter(s)}>{s} ({s==="ALL"?data.results.length:data.results.filter(r=>r.status===s).length})</Button>)}</div>
 <Table headers={["Test ID","Deskripsi Skenario","Status: PASS/FAIL","Catatan & Temuan Bug/Kendala"]} rows={shown.map(r=>[r.id,r.scenario,r.status,r.notes])} striped stickyHeader />
 <h2 style={{fontSize:18}}>Prioritas perbaikan sebelum rilis</h2>
 {data.notes.bugs.map(b=><details key={b.id} style={{borderBottom:`1px solid ${t.stroke.primary}`,padding:"12px 0"}}><summary><b>{b.id} · {b.priority} · {b.title}</b></summary><p>{b.detail}</p><small style={{color:t.text.secondary}}>{b.source}</small></details>)}
 <p style={{color:t.text.secondary}}>Sumber: hasil API dan browser pada working tree 7e36b53. Raw evidence, file unduhan, screenshot, dan harness tersedia dalam artifacts/analytics-qa. Tidak ada perubahan implementasi aplikasi.</p>
 </main>;
}
'''.replace('DATA',json.dumps({'notes':notes,'results':rows},ensure_ascii=False))
(P/'analytics-qa.canvas.tsx').write_text(canvas)
print(summary)
