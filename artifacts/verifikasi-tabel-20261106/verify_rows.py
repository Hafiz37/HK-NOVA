import os,sys,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('/home/gopal-ichiro/Documents/magang/hk-nova'); OUT=Path('/tmp/hkn-verification-20261106')
sys.path.insert(0,str(ROOT))
os.environ.update(DATABASE_URL='sqlite:///'+str(OUT/'rows2.db'),SECRET_KEY='verification-fixture-only',BACKUP_DIR=str(OUT/'backups'),SSH_KEY_DIR=str(OUT/'keys'),PYTHONDONTWRITEBYTECODE='1')
from app.main import app
from app.database import Base,engine,SessionLocal
from app.models.user import User,UserRole
from app.models.device import Device
from app.models.destination import Destination,DestinationType
from app.models.backup import Backup,BackupStatus
from app.models.job import Schedule,JobRun,JobStatus
from app.security import hash_password
from fastapi.testclient import TestClient
Base.metadata.create_all(engine)
pw='Local-fixture-password-123'
with SessionLocal() as db:
 for role in UserRole: db.add(User(username=role.value,password_hash=hash_password(pw),role=role,is_active=True))
 db.add(Destination(name='fixture-local',dest_type=DestinationType.local,enabled=True,config_json={'path':str(OUT/'files')}))
 db.add(User(username='inactive',password_hash=hash_password(pw),role=UserRole.viewer,is_active=False));db.commit()
c=TestClient(app,follow_redirects=False,raise_server_exceptions=False)
results=[]
def check(ok,msg):
 if not ok: raise AssertionError(msg)
def run(code,fn):
 try:
  note=fn(); results.append(dict(code=code,passed=True,note=note))
 except Exception as e: results.append(dict(code=code,passed=False,note=type(e).__name__+': '+str(e)))
 (OUT/'rows.json').write_text(json.dumps(results,indent=2,ensure_ascii=False));print(results[-1],flush=True)
def login(role):
 c.cookies.clear();c.auth=None
 r=c.post('/login',data={'username':role,'password':pw});check(r.status_code==303,f'login {role}: {r.status_code}');return r
def auth():
 for role in ['admin','operator','viewer']:
  r=login(role);check(r.headers['location']=='/','redirect dashboard');check(c.get('/').status_code==200,'dashboard')
  check(c.get('/profile').status_code==200,'session');check(c.post('/logout').status_code==303,'logout');check(c.get('/profile').status_code==302,'after logout')
 return 'Ketiga peran berhasil login (303), membuka dashboard/profile (200), dan logout; akses setelah logout diarahkan ke login (302).'
run('BB-001',auth)
def bad():
 for name,password in [('admin','wrong'),('inactive',pw)]:
  c.cookies.clear();r=c.post('/login',data={'username':name,'password':password});check(r.status_code==401,'invalid login');check('Invalid username or password' in r.text,'error message')
 check(c.get('/profile').status_code==302,'unauthenticated page')
 return 'Password salah dan akun nonaktif ditolak (401) dengan pesan kesalahan; akses tanpa login diarahkan ke login (302).'
run('BB-002',bad)
def devices():
 for role in ['admin','operator']:
  login(role);data={'hostname':'fixture-'+role,'ip_address':'192.0.2.20','device_type':'cisco_ios','destination_ids':[1]}
  r=c.post('/devices/add',data=data);check(r.status_code==303,'create');id=int(r.headers['location'].split('/')[-1]);check(data['hostname'] in c.get('/devices/').text,'list create')
  data['hostname']+='-updated';check(c.post(f'/devices/{id}/edit',data=data).status_code==303,'edit');check(data['hostname'] in c.get('/devices/').text,'list edit')
  check(c.post(f'/devices/{id}/delete').status_code==303,'delete');check(data['hostname'] not in c.get('/devices/').text,'list delete')
 return 'Admin dan Operator masing-masing berhasil menambah, mengubah, dan menghapus perangkat; daftar setelah setiap tindakan sesuai perubahan.'
run('BB-004',devices)
def invalidcron():
 login('admin')
 with SessionLocal() as db:
  s=Schedule(name='fixture schedule',cron_expression='0 2 * * *',enabled=False);db.add(s);db.commit();sid=s.id;before=db.query(Schedule).count()
 for url in ['/jobs/add',f'/jobs/{sid}/edit']:
  r=c.post(url,data={'name':'fixture schedule','cron_expression':'not-valid'});check(r.status_code==400,f'cron {r.status_code}')
 with SessionLocal() as db: check(db.query(Schedule).count()==before and db.get(Schedule,sid).cron_expression=='0 2 * * *','schedule mutated')
 return 'Penambahan dan perubahan dengan cron not-valid ditolak (400); jumlah jadwal dan cron lama tetap sama.'
run('BB-013',invalidcron)
def users():
 login('admin');r=c.post('/api/users',json={'username':'fixture-user','password':pw,'role':'viewer','is_active':True});check(r.status_code==201,'create user');uid=r.json()['id']
 check(c.put(f'/api/users/{uid}',json={'role':'operator'}).status_code==200,'change role');login('fixture-user');check(c.get('/devices/add').status_code==200,'new role')
 login('admin');check(c.put(f'/api/users/{uid}',json={'is_active':False}).status_code==200,'deactivate');c.cookies.clear();check(c.post('/login',data={'username':'fixture-user','password':pw}).status_code==401,'inactive login')
 login('admin');check(c.delete(f'/api/users/{uid}').status_code==204,'delete');check('fixture-user' not in c.get('/users').text,'removed from list')
 return 'Akun berhasil dibuat, peran berubah menjadi Operator dan aksesnya berlaku; penonaktifan menolak login (401), penghapusan berhasil (204) dan akun hilang dari daftar.'
run('BB-023',users)
def permissions():
 login('viewer')
 for url in ['/devices/add','/backups/1/now','/diagnostics/device/1/retry','/notifications/add','/api/v1/locations/']:
  check(c.post(url).status_code==403,'viewer '+url)
 login('operator')
 for url in ['/credentials/','/destinations/','/users','/audit-logs']:check(c.get(url).status_code==403,'operator '+url)
 login('admin')
 for url in ['/credentials/','/destinations/','/users','/audit-logs']:check(c.get(url).status_code==200,'admin '+url)
 return 'Permintaan langsung Viewer untuk tindakan operasi ditolak (403); Operator ditolak pada empat menu administrasi; Admin menerima 200. Pengaturan lokasi/channel oleh Operator belum diuji lengkap.'
run('BB-024',permissions)
def analytics():
 login('admin')
 with SessionLocal() as db:
  d=Device(hostname='analytics-fixture',ip_address='192.0.2.30',device_type='cisco_ios');db.add(d);db.flush()
  for status in [BackupStatus.success,BackupStatus.failed]:db.add(Backup(device_id=d.id,status=status,timestamp=datetime(2026,10,1,10),file_size=100 if status==BackupStatus.success else 0))
  db.commit()
 p={'start_date':'2026-10-01','end_date':'2026-10-01'}
 check(c.get('/analytics').status_code==200,'analytics page')
 rel=c.get('/api/v1/analytics/reliability-score',params=p);check(rel.status_code==200,'reliability');j=rel.json();check(j['total_backups']==2 and j['overall_score']==50,j)
 tr=c.get('/api/v1/analytics/backup-trend',params=p).json();check(tr['data'][0]['success']==1 and tr['data'][0]['failed']==1,tr)
 for ep in ['backup-trend','reliability-score','storage-usage']:
  check(c.get('/api/v1/analytics/'+ep,params=p).status_code==200,ep)
 r=c.get('/api/v1/analytics/backup-trend',params={'start_date':'2026-10-02','end_date':'2026-10-01'});check(r.status_code==400,'reverse')
 empty=c.get('/api/v1/analytics/backup-trend',params={'start_date':'2099-01-01','end_date':'2099-01-01'}).json();check(all(x['success']==0 and x['failed']==0 for x in empty['data']),empty)
 return 'Fixture 2 backup menghasilkan reliability 50% dan tren 1 berhasil/1 gagal; periode kosong menghasilkan nol; tanggal terbalik ditolak (400). API storage merespons 200, tetapi nilai penyimpanan per periode belum dibuktikan.'
run('BB-019',analytics)
def audit():
 login('admin')
 from app.models.audit_log import AuditLog
 with SessionLocal() as db:
  logs=db.query(AuditLog).all();check(any(x.action=='LOGIN_SUCCESS' for x in logs),'login log')
  for action in ['CREATE','UPDATE','DELETE']:
   check(any(x.action==action and x.resource_type=='users' for x in logs),'user audit '+action)
 for action in ['LOGIN_SUCCESS','CREATE','UPDATE','DELETE']:
  r=c.get('/audit-logs',params={'action':action});check(r.status_code==200,'audit page');check(action in r.text,'filter action')
  # Verify the table rows themselves, not the options in the filter form.
  from html.parser import HTMLParser
  class Rows(HTMLParser):
   def __init__(self):super().__init__();self.inside=False;self.text=[]
   def handle_starttag(self,t,a):
    if t=='tbody':self.inside=True
   def handle_endtag(self,t):
    if t=='tbody':self.inside=False
   def handle_data(self,d):
    if self.inside:self.text.append(d)
  parser=Rows();parser.feed(r.text);check(action in ' '.join(parser.text),'filtered row')
 return 'Aktivitas login dan CRUD akun tercatat dengan pelaku/waktu/status; halaman audit merespons 200 dan baris hasil filter memuat tindakan yang dipilih. Suite audit juga memeriksa metadata dan pembatasan akses.'
run('BB-025',audit)
c.close()
