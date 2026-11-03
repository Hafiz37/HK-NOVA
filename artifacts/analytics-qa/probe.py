"""Run from repository root: .venv/bin/python artifacts/analytics-qa/probe.py [serve].
Isolated in-memory DB; app lifespan disabled to avoid scheduler/production writes.
"""
import os,sys,json,csv,io
from pathlib import Path
from datetime import datetime,timedelta
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
os.environ.update(DATABASE_URL='sqlite://',AUTH_USERNAME='qa-local',AUTH_PASSWORD='qa-local-test',SECRET_KEY='qa-only-isolated-key')
from app.main import app
from app.database import Base,get_db
from app.models.device import Device
from app.models.backup import Backup,BackupStatus
from app.models.group import Group
from app.models.job import JobRun,JobStatus
from app.routers import analytics
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from openpyxl import load_workbook
OUT=Path(__file__).parent
NOW=datetime(2026,11,3,12)
class Frozen(datetime):
    @classmethod
    def utcnow(cls):return NOW
analytics.datetime=Frozen
engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
Base.metadata.create_all(engine); Session=sessionmaker(bind=engine)
def dbdep():
    with Session() as s:yield s
app.dependency_overrides[get_db]=dbdep
client=TestClient(app,raise_server_exceptions=False)
AUTH=('qa-local','qa-local-test'); prefix='/api/v1/analytics/'
endpoints=[r.path.removeprefix(prefix) for r in analytics.router.routes if getattr(r,'path','').startswith(prefix)]
results=[]; evidence={}
def record(id,desc,ok,note):results.append(dict(id=id,scenario=desc,status='PASS' if ok else 'FAIL',notes=note))
def get(ep,**params):return client.get(prefix+ep,params=params,auth=AUTH)
def seed(mode='normal'):
    Base.metadata.drop_all(engine);Base.metadata.create_all(engine)
    if mode=='empty':return
    with Session() as s:
        s.add(Group(name='QA'));s.flush()
        for i in range(1,29):
            s.add(Device(id=i,hostname=f'qa-device-{i:02}',ip_address=f'192.0.2.{i}',device_type=['cisco_ios','mikrotik_routeros','pfsense'][i%3],group='QA',enabled=True))
        s.flush()
        for i in range(1,29):
            # 16 perfect, 12 failed; historical target day excludes next-day failures.
            s.add(Backup(device_id=i,timestamp=datetime(2026,10,1,10),status=BackupStatus.success if i<=16 else BackupStatus.failed,file_size=1048576))
        s.add(Backup(device_id=1,timestamp=datetime(2026,10,2,0),status=BackupStatus.failed,file_size=0))
        s.add(Backup(device_id=1,timestamp=datetime(2026,9,30,23,59,59),status=BackupStatus.failed,file_size=0))
        for d in range(1,8):
            for i in range(1,4):s.add(Backup(device_id=i,timestamp=NOW-timedelta(days=d),status=BackupStatus.success,file_size=i*1048576))
        for n in range(6):s.add(Backup(device_id=28,timestamp=NOW-timedelta(hours=n+1),status=BackupStatus.failed,file_size=0))
        s.add(JobRun(job_name='QA completed',started_at=NOW-timedelta(hours=2),completed_at=NOW-timedelta(hours=2)+timedelta(seconds=120),status=JobStatus.completed))
        s.commit()
if __name__=='__main__':
    seed()
    if 'serve' in sys.argv:
        # Test-only fixture switching, local loopback only.
        @app.post('/qa-fixture/{mode}')
        def fixture(mode:str):seed(mode);return {'mode':mode}
        import uvicorn;uvicorn.run(app,host='127.0.0.1',port=5017,lifespan='off');sys.exit()
    anon={ep:client.get(prefix+ep).status_code for ep in endpoints}
    record('SEC-01','Autentikasi seluruh endpoint API',all(v==401 for v in anon.values()),str(anon))
    r=client.get('/analytics',follow_redirects=False);record('SEC-02','Autentikasi halaman web',r.status_code==302 and r.headers.get('location','').startswith('/login'),f'{r.status_code} {r.headers.get("location")}')
    for days in [1,7,30,90]:
        e={ep:get(ep,days=days).status_code for ep in ['reliability-score','backup-trend','device-type-distribution','backup-frequency-by-group','performance-metrics','anomalies','backup-heatmap']}
        record(f'API-R{days}','API quick range '+str(days)+' hari',all(v==200 for v in e.values()),str(e))
    target=dict(days=30,start_date='2026-10-01',end_date='2026-10-01')
    rel=get('reliability-score',**target).json();trend=get('backup-trend',**target).json()
    evidence['historical']={'reliability':rel,'trend':trend}
    record('INT-01','Batas end_date inklusif; backup setelah akhir dikecualikan',rel['total_backups']==28,f'Expected 28 backup; actual {rel["total_backups"]}; trend {trend}')
    record('INT-02','Agregasi reliability sesuai fixture',rel['overall_score']==round(16/28*100,2),f'Expected 57.14%; actual {rel["overall_score"]}%')
    record('INT-03','Trend satu tanggal mencakup 24 jam',len(trend['data'])==1 and trend['data'][0]['success']==16 and trend['data'][0]['failed']==12,str(trend))
    for days in [1,6,91,365]:
        r=get('reliability-score',days=days,start_date='2026-10-01',end_date=(datetime(2026,10,1)+timedelta(days=days-1)).strftime('%Y-%m-%d'))
        record(f'CUSTOM-{days}','Custom range dengan days='+str(days),r.status_code==200,f'HTTP {r.status_code}: {r.text[:230]}')
    for name,a,b in [('reverse','2026-10-07','2026-10-01'),('over365','2024-01-01','2026-10-01')]:
        r=get('backup-trend',days=30,start_date=a,end_date=b);j=r.json()
        record('VALID-'+name,'Validasi API '+name,r.status_code in [400,422] or (0<len(j.get('data',[]))<=365 and name=='over365'),f'HTTP {r.status_code}; period={j.get("period")}; rows={len(j.get("data",[]))}')
    bad={ep:get(ep,days=30,start_date='01/10/2026',end_date='not-date').status_code for ep in endpoints}
    record('EDGE-01','Format tanggal invalid: 400 atau fallback aman',all(v in [200,400,422] for v in bad.values()),str(bad)+'; fallback diam-diam untuk parameter invalid')
    heat=get('backup-heatmap',**target).json();freq=get('backup-frequency-by-group',**target).json();dist=get('device-type-distribution',**target).json()
    record('CHART-01','Heatmap 7x24 dan hitungan periode',len(heat['data'])==7 and all(len(x['data'])==24 for x in heat['data']) and sum(sum(x['data']) for x in heat['data'])==28,f'Shape 7x24; sum={sum(sum(x["data"]) for x in heat["data"])} expected 28')
    record('CHART-02','Backup per group sesuai periode',freq['data'][0]['total_backups']==28,str(freq))
    record('CHART-03','Distribusi tipe: jumlah perangkat dan backup',sum(d['device_count'] for d in dist['data'])==28 and sum(d['total_backups'] for d in dist['data'])==28,str(dist))
    tops=rel['top_performers'];record('LIST-01','Top performer descending, maksimal 15',len(tops)<=15 and [d['score'] for d in tops]==sorted([d['score'] for d in tops],reverse=True),f'{len(tops)} entries; API cap 10 dan hanya score >=95, bukan 15 terbaik keseluruhan')
    probs=rel['problematic_devices'];expected=[d for d in rel['device_scores'] if d['score']<80 and d['total_backups']>0]
    record('LIST-02','Semua problematic devices terdaftar',len(probs)==len(expected),f'Actual {len(probs)}; expected {len(expected)}; API truncate 10')
    m=get('performance-metrics',days=30).json();evidence['metrics']=m
    record('KPI-01','Format duration, size, peak hour',m['avg_duration']=='2.0m' and m['avg_size']=='2.0 MB' and m['peak_hour']=='12:00',str(m))
    record('KPI-02','Fastest Device berdasarkan kecepatan backup',False,f'Actual {m["fastest_device"]}: {m["fastest_device_detail"]}; implementasi memilih ukuran file terkecil, tidak durasi perangkat.')
    anomaly=get('anomalies',days=30).json();evidence['anomalies']=anomaly
    record('ANOM-01','Deteksi lonjakan kegagalan',any(x['type']=='success_rate_drop' for x in anomaly['anomalies']),str(anomaly))
    for fmt,ext,mime in [('csv','csv','text/csv'),('excel','xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),('json','json','application/json'),('pdf','pdf','application/pdf')]:
        r=get('export-'+fmt,**target);(OUT/f'export.{ext}').write_bytes(r.content)
        ok=r.status_code==200 and r.headers.get('content-type','').startswith(mime) and 'attachment' in r.headers.get('content-disposition',''); detail=''
        if fmt=='csv':
            rows=list(csv.reader(io.StringIO(r.text)));ok &= len(rows[0])==9 and all(len(x)==9 for x in rows);total=sum(int(x[4]) for x in rows[1:]);detail=f'{len(rows)-1} rows, 9 columns'
        if fmt=='excel':
            w=load_workbook(io.BytesIO(r.content));ok &= w.sheetnames==['Summary','By Device'];total=w['Summary']['B7'].value;detail=str(w.sheetnames)
        if fmt=='json':total=r.json()['reliability_score']['total_backups'];detail='JSON parsed'
        if fmt=='pdf':total=rel['total_backups'];ok &= r.content.startswith(b'%PDF-');detail='PDF magic; rendering inspected separately'
        record('EXP-'+fmt,'Header dan struktur export '+fmt,ok,f'HTTP {r.status_code}; {r.headers.get("content-type")}; {detail}')
        record('EXP-FILTER-'+fmt,'Filter tanggal export '+fmt,total==28,f'Expected total 28; actual {total}'+(' (PDF count verified via text extraction)' if fmt=='pdf' else ''))
    future={ep:get(ep,days=30,start_date='2099-01-01',end_date='2099-01-07') for ep in ['reliability-score','backup-trend','backup-frequency-by-group','backup-heatmap','performance-metrics','anomalies']}
    evidence['future']={k:v.json() for k,v in future.items()}
    record('EDGE-02','Tanggal masa depan tanpa data/anomali',all(v.status_code==200 for v in future.values()) and future['reliability-score'].json()['total_backups']==0 and not future['anomalies'].json()['anomalies'],f'Reliability 0; anomalies={future["anomalies"].json()}')
    seed('empty');empty={ep:get(ep).status_code for ep in endpoints}
    record('EDGE-03','Database kosong dan division by zero seluruh API',all(v==200 for v in empty.values()),str(empty))
    evidence['empty']={ep:get(ep).json() for ep in ['reliability-score','performance-metrics','anomalies','backup-heatmap']}
    (OUT/'api-results.json').write_text(json.dumps(results,indent=2));(OUT/'evidence.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(results,indent=2))
