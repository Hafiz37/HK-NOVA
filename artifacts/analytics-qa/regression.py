from probe import *
seed()
checks=[]
def check(name,ok):
    checks.append({'check':name,'pass':bool(ok)})
    print(name, 'PASS' if ok else 'FAIL')
for days in [1,7,30,90,365]:
    for ep in endpoints:
        check(f'{ep} days={days}',get(ep,days=days).status_code==200)
for ep in endpoints:
    if ep in ['device-status','storage-usage','recent-activity']:continue
    check(ep+' invalid',get(ep,start_date='bad',end_date='bad').status_code==400)
    check(ep+' reversed',get(ep,start_date='2026-10-07',end_date='2026-10-01').status_code==400)
    check(ep+' too long',get(ep,start_date='2024-01-01',end_date='2026-10-01').status_code==400)
t=dict(start_date='2026-10-01',end_date='2026-10-01')
r=get('reliability-score',**t).json();check('bounded totals',r['total_backups']==28 and r['overall_score']==57.14);check('all problematic',len(r['problematic_devices'])==12)
for d in [1,7,30,90]:check(f'trend buckets {d}',len(get('backup-trend',days=d).json()['data'])==d)
check('future anomaly',not get('anomalies',start_date='2099-01-01',end_date='2099-01-07').json()['anomalies'])
check('missing timing honest',get('performance-metrics').json()['fastest_device']=='N/A')
with Session() as s:
    j=JobRun(job_name='single',started_at=NOW-timedelta(hours=1),completed_at=NOW-timedelta(hours=1)+timedelta(seconds=5),status=JobStatus.completed,devices_total=1);s.add(j);s.flush();s.add(Backup(device_id=2,timestamp=NOW-timedelta(hours=1),status=BackupStatus.success,file_size=100,job_run_id=j.id));s.commit()
check('fastest timing',get('performance-metrics').json()['fastest_device']=='qa-device-02')
seed('empty')
for ep in endpoints:check('empty '+ep,get(ep).status_code==200)
(OUT/'regression-results.json').write_text(json.dumps(checks,indent=2))
assert all(x['pass'] for x in checks)
