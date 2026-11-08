import os,sys,json
from pathlib import Path
out=Path('/tmp/hkn-verification-20261106')
sys.path.insert(0,'/home/gopal-ichiro/Documents/magang/hk-nova')
os.environ.update(DATABASE_URL='sqlite:///'+str(out/'rows2.db'),SECRET_KEY='verification-fixture-only',BACKUP_DIR=str(out/'backups'),SSH_KEY_DIR=str(out/'keys'))
from app.main import app
from app.database import SessionLocal
from app.models.backup import Backup,BackupStatus
from fastapi.testclient import TestClient
with SessionLocal() as db:
 b=db.query(Backup).filter(Backup.status==BackupStatus.success).first();b.destination_path='/tmp/fixture-local/test.cfg';b.file_size=100;db.commit()
c=TestClient(app,follow_redirects=False)
c.auth=('admin','Local-fixture-password-123')
r=[]
for day in ['2026-10-01','2099-01-01']:
 response=c.get('/api/v1/analytics/storage-usage',params={'start_date':day,'end_date':day})
 r.append({'date':day,'http':response.status_code,'actual':response.json(),'expected_size_bytes':100 if day=='2026-10-01' else 0})
(out/'storage.json').write_text(json.dumps(r,indent=2));print(json.dumps(r));c.close()
