from probe import *
seed()
for days in [7,30,90]:
    j=get('backup-trend',days=days).json()
    record('TREND-'+str(days),'Quick range '+str(days)+' hari: jumlah bucket harian',len(j['data'])==days,f'Expected {days}; actual {len(j["data"])}; period={j["period"]}; window dimulai pukul 12:00, bukan midnight')
for fmt in ['csv','excel','json','pdf']:
    statuses={str(d):get('export-'+fmt,days=d).status_code for d in [1,7,30,90,365]}
    record('EXP-DAYS-'+fmt,'Export '+fmt+' dengan days=1/7/30/90/365',all(v==200 for v in statuses.values()),str(statuses))
with Session() as s:
    s.query(Backup).filter(Backup.status==BackupStatus.failed).delete();s.commit()
j=get('anomalies',days=7).json()
record('ANOM-NORMAL','Anomali normal: data sukses tanpa kegagalan',j['anomalies']==[],str(j))
seed('empty')
with Session() as s:
    s.add(Group(name='QA'));s.add(Device(id=1,hostname='qa-one',ip_address='192.0.2.1',device_type='cisco_ios',group='QA',enabled=True));s.flush()
    for st in [BackupStatus.success,BackupStatus.failed,BackupStatus.unchanged,BackupStatus.in_progress]:s.add(Backup(device_id=1,timestamp=NOW-timedelta(hours=1),status=st,file_size=100))
    s.commit()
rel=get('reliability-score').json();trend=get('backup-trend').json();csvdata=list(csv.reader(io.StringIO(get('export-csv').text)))
record('STATUS-01','Status unchanged/in_progress tidak dihitung sebagai failed',int(csvdata[1][6])==1,f'Fixture 1 success, 1 failed, 1 unchanged, 1 in_progress. CSV failed={csvdata[1][6]}, reliability={rel["overall_score"]}%; trend menghitung hanya success/failed (50%).')
record('PDF-A4','PDF A4, seluruh section dan warna header',True,'pdfinfo: 595.276 x 841.89 pts, 2 halaman; inspeksi PNG: Summary biru, Top Performers hijau, Problematic merah, 15 top + 12 problematic tercetak.')
record('PDF-PAGING','PDF tabel multi-page tetap memiliki header kolom',False,'Halaman kedua melanjutkan baris qa-device-20 s.d. 28 tanpa header kolom; repeatRows belum dipasang.')
(OUT/'extra-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
